"""A deposit for an hourly stay, apart from the one for nights (CRM item 17).

The owner of Munar took 7 000 ₸ for six hours, not the deposit of a night. One
`default_deposit` per flat made the CRM's AI name the nightly deposit for hours.
Now the host sets both; 0 means "not set", and hours never fall back to the
nightly deposit.
"""

from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.application.property.clone_property import ClonePropertyService
from app.application.property.manage_pricing import ManagePricingService, PricingConfigInput
from app.domain.auth.permissions import Permission
from app.domain.booking.value_objects import RentalMode
from app.domain.property.entities import PricingConfig
from app.presentation.schemas.property import PricingConfigCreate
from app.presentation.schemas.public import PublicStayResponse
from tests.test_property_facts import flat  # noqa: F401  (a fixture)
from tests.test_property_services import (
    COMPANY_ID,
    FakeAmenityRepository,
    FakeDiscountRuleRepository,
    FakePricingConfigRepository,
    FakePropertyAuditLogRepository,
    FakePropertyPhotoRepository,
    FakePropertyRepository,
    FakeSeasonalPriceRepository,
    _make_property,
)
from tests.test_public_stay import Stay


def test_the_hourly_deposit_is_not_negative_and_unset_by_default():
    assert PricingConfigCreate(base_price=Decimal("25000")).hourly_deposit == 0
    with pytest.raises(ValidationError):
        PricingConfigCreate(base_price=Decimal("25000"), hourly_deposit=Decimal("-1"))


async def test_the_hourly_deposit_is_saved_apart_from_the_nightly_one():
    props = FakePropertyRepository()
    prop = _make_property()
    await props.save(prop)
    svc = ManagePricingService(props, FakePricingConfigRepository(), FakeSeasonalPriceRepository(),
                               FakeDiscountRuleRepository())
    both = PricingConfigInput(base_price=Decimal("25000"), default_deposit=Decimal("10000"),
                              hourly_deposit=Decimal("7000"))

    created = await svc.upsert_pricing(prop.id, COMPANY_ID, both)
    assert (created.default_deposit, created.hourly_deposit) == (Decimal("10000"), Decimal("7000"))

    updated = await svc.upsert_pricing(prop.id, COMPANY_ID, PricingConfigInput(
        base_price=Decimal("25000"), default_deposit=Decimal("10000"), hourly_deposit=Decimal("5000")))
    assert (updated.default_deposit, updated.hourly_deposit) == (Decimal("10000"), Decimal("5000"))


async def test_a_clone_keeps_the_hourly_deposit():
    props, pricing = FakePropertyRepository(), FakePricingConfigRepository()
    source = _make_property()
    await props.save(source)
    await pricing.save(PricingConfig(property_id=source.id, base_price=Decimal("25000"),
                                     hourly_deposit=Decimal("7000")))
    svc = ClonePropertyService(props, FakePropertyPhotoRepository(), FakeAmenityRepository(), pricing,
                               FakeSeasonalPriceRepository(), FakeDiscountRuleRepository(),
                               FakePropertyAuditLogRepository())

    clone = await svc.execute(source.id, COMPANY_ID)

    assert (await pricing.get_by_property(clone.id)).hourly_deposit == Decimal("7000")


@pytest.mark.parametrize(
    "mode, deposits",
    [
        (RentalMode.HOURLY, (None, 7000.0)),
        (RentalMode.DAILY, (10000.0, None)),
        (RentalMode.BOTH, (10000.0, 7000.0)),
    ],
)
async def test_the_guest_page_shows_the_deposit_of_each_kind_of_stay_the_flat_takes(mode, deposits):
    s = Stay()
    prop = await s.flat(hourly_price=Decimal("3000"), default_deposit=Decimal("10000"),
                        hourly_deposit=Decimal("7000"))
    prop.rental_mode = mode
    await s.props.save(prop)

    found = await s.service().execute(prop.public_code, date(2030, 10, 1), date(2030, 10, 3))
    prices = PublicStayResponse.from_stay(found).prices

    assert (prices.deposit, prices.hour_deposit) == deposits


async def test_a_flat_priced_by_its_calendar_still_shows_its_nightly_deposit():
    # No base price, the nights are priced day by day: the link still takes the
    # deposit, so the page must show it.
    s = Stay()
    prop = await s.flat(default_deposit=Decimal("10000"))
    (await s.pricing.get_by_property(prop.id)).base_price = Decimal("0")
    prop.rental_mode = RentalMode.DAILY
    await s.props.save(prop)

    found = await s.service().execute(prop.public_code, date(2030, 10, 1), date(2030, 10, 3))

    assert PublicStayResponse.from_stay(found).prices.deposit == 10000.0


async def test_an_unset_hourly_deposit_is_not_the_nightly_one():
    s = Stay()
    prop = await s.flat(hourly_price=Decimal("3000"), default_deposit=Decimal("10000"))

    found = await s.service().execute(prop.public_code, date(2030, 10, 1), date(2030, 10, 3))
    prices = PublicStayResponse.from_stay(found).prices

    assert (prices.deposit, prices.hour_deposit) == (10000.0, None)


@pytest.mark.integration
async def test_the_crm_reads_the_hourly_deposit_in_the_flat_card(flat):  # noqa: F811  (the imported fixture)
    client, prop, use = flat
    use(Permission.PROPERTIES_READ, Permission.PROPERTIES_WRITE)
    saved = await client.put(f"/api/v1/properties/{prop}/pricing", json={
        "base_price": 25000, "hourly_price": 3000, "default_deposit": 10000, "hourly_deposit": 7000,
    })
    assert saved.status_code == 200, saved.text
    assert saved.json()["hourly_deposit"] == 7000

    # The key of the CRM: properties:read.
    use(Permission.PROPERTIES_READ)
    card = (await client.get(f"/api/v1/properties/{prop}")).json()

    assert (card["pricing"]["default_deposit"], card["pricing"]["hourly_deposit"]) == (10000, 7000)
