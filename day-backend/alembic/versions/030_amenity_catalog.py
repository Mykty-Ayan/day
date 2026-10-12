"""A real amenity catalogue instead of five seed rows.

The list follows the groups Airbnb and Booking.com use, in Russian (the
market's language). The five English names of the old development seed are
renamed where nothing in Russian exists yet, so a database that had them does
not end up with both "Kitchen" and "Кухня". Existing links to flats are kept.

Not reversible: removing catalogue rows would drop flats' amenities.

Revision ID: 030_amenity_catalog
Revises: 029_property_check_in
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "030_amenity_catalog"
down_revision: Union[str, None] = "029_property_check_in"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CATALOG = {
    "comfort": [
        "Wi-Fi", "Кондиционер", "Отопление", "Постельное бельё", "Дополнительные подушки и одеяла", "Утюг",
        "Вешалки", "Шкаф для одежды", "Стиральная машина", "Сушильная машина", "Сушилка для белья",
        "Затемняющие шторы", "Рабочее место", "Лифт", "Самостоятельное заселение", "Детская кроватка",
        "Детский стульчик",
    ],
    "bathroom": ["Фен", "Шампунь и гель для душа", "Полотенца", "Горячая вода", "Ванна", "Душевая кабина", "Биде"],
    "kitchen": [
        "Кухня", "Холодильник", "Морозильная камера", "Микроволновая печь", "Плита", "Духовка", "Чайник",
        "Кофеварка", "Посуда и столовые приборы", "Посудомоечная машина", "Обеденный стол", "Тостер", "Мультиварка",
    ],
    "entertainment": ["Телевизор", "Smart TV", "Кабельное ТВ", "Игровая приставка", "Книги", "Настольные игры"],
    "safety": [
        "Датчик дыма", "Датчик угарного газа", "Огнетушитель", "Аптечка", "Камеры видеонаблюдения снаружи",
        "Домофон", "Охрана или консьерж", "Сейф",
    ],
    "outdoor": [
        "Балкон", "Терраса", "Мангал", "Бесплатная парковка во дворе", "Бесплатная парковка на улице",
        "Платная парковка", "Подземный паркинг", "Детская площадка", "Вид на горы", "Вид на город",
    ],
    "accessibility": ["Вход без ступенек", "Широкий дверной проём", "Поручни в ванной", "Первый этаж"],
    "other": ["Трансфер из аэропорта", "Уборка во время проживания", "Хранение багажа", "Долгосрочное проживание"],
}

# The old development seed, in English.
RENAMES = {
    "Air Conditioning": "Кондиционер",
    "Parking": "Бесплатная парковка во дворе",
    "Kitchen": "Кухня",
    "Pool": "Бассейн",
}


def upgrade() -> None:
    bind = op.get_bind()
    for old, new in RENAMES.items():
        bind.execute(
            sa.text(
                "UPDATE amenities SET name = :new WHERE name = :old "
                "AND NOT EXISTS (SELECT 1 FROM amenities WHERE name = :new)"
            ),
            {"old": old, "new": new},
        )
    for category, names in CATALOG.items():
        for name in names:
            bind.execute(
                sa.text(
                    "INSERT INTO amenities (id, name, category) VALUES (gen_random_uuid(), :name, :category) "
                    "ON CONFLICT (name) DO NOTHING"
                ),
                {"name": name, "category": category},
            )


def downgrade() -> None:
    pass
