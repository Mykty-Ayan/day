# RTK — аналитика токенов

```bash
rtk gain                        # общая статистика экономии
rtk gain --graph                # ASCII-график за последние 30 дней
rtk gain --history              # история команд с экономией по каждой
rtk gain --daily                # разбивка по дням
rtk gain --all --format json    # экспорт в JSON

rtk discover                    # какие команды можно было прогнать через rtk, но не прогнал
rtk discover --all --since 7    # то же, за последние 7 дней по всем проектам

rtk session                     # покрытие rtk в последних сессиях
```
