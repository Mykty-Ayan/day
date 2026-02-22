import enum


class Currency(str, enum.Enum):
    KZT = "KZT"
    USD = "USD"
    EUR = "EUR"
    RUB = "RUB"


class Language(str, enum.Enum):
    RU = "ru"
    KZ = "kz"
    EN = "en"
