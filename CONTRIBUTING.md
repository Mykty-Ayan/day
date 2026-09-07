# Как мы работаем с кодом

Модель ветвления — GitFlow. Ниже: какие бывают ветки, кто от кого растёт, куда вливается,
как называть коммиты и что должно быть зелёным до merge.

## Постоянные ветки

| Ветка | Что это | Кто туда пишет |
|---|---|---|
| `main` | То, что стоит на проде. Каждый коммит здесь — релиз с тегом. | Только merge из `release/*` и `hotfix/*` |
| `develop` | Интеграционная ветка. Здесь копится следующий релиз. | merge из `feature/*`, `fix/*`, обратный merge из `release/*` и `hotfix/*` |

Прямой push в `main` и `develop` запрещён. Всё через Pull Request.

## Временные ветки

| Префикс | От кого | Куда вливается | Зачем |
|---|---|---|---|
| `feature/<слаг>` | `develop` | `develop` | Новая функциональность |
| `fix/<слаг>` | `develop` | `develop` | Починка того, что ещё не на проде |
| `refactor/<слаг>`, `test/<слаг>`, `docs/<слаг>`, `ci/<слаг>` | `develop` | `develop` | По смыслу названия |
| `release/<версия>` | `develop` | `main` **и** обратно в `develop` | Стабилизация перед выкаткой |
| `hotfix/<версия>` | `main` | `main` **и** обратно в `develop` | Пожар на проде |

Слаг — латиницей, через дефис, по существу: `feature/channex-rate-sync`, а не `feature/new-stuff`.

## Обычный цикл: фича

```bash
git checkout develop && git pull
git checkout -b feature/deposit-partial-refund
# ...работа, коммиты...
git push -u origin feature/deposit-partial-refund
gh pr create --base develop --fill
```

После merge ветка удаляется (в настройках репозитория включено авто-удаление; если нет — руками).

Ветка живёт **дни, не недели**. Долгая ветка = болезненный merge. Если фича большая — режь на
несколько PR, каждый сам по себе рабочий и вливаемый.

Пока фича в работе, подтягивай `develop` в себя, чтобы не расходиться:

```bash
git fetch origin && git rebase origin/develop
```

Rebase — только пока ветка твоя и не влита. Уже отревьюенную ветку с чужими комментариями
не переписываем — там `git merge origin/develop`.

## Релиз

```bash
git checkout develop && git pull
git checkout -b release/0.4.0
```

В `release/*` попадают только правки стабилизации: багфиксы, номер версии, changelog.
Новых фич здесь нет — они ждут следующего релиза в `develop`.

Когда стабильно:

```bash
gh pr create --base main --title "release: 0.4.0"     # ревью, зелёный CI
# после merge PR в main:
git checkout main && git pull
git tag -a v0.4.0 -m "release 0.4.0"
git push origin v0.4.0
# и обязательно вернуть релизные правки в develop:
gh pr create --base develop --head release/0.4.0 --title "chore: merge release 0.4.0 back to develop"
```

Тег ставится **после** merge в `main`, на коммит merge. Выкатка Dokploy делается с этого тега —
чтобы всегда было понятно, какой код сейчас у клиента.

Версии — SemVer: `v<major>.<minor>.<patch>`. До публичного запуска мажор `0`.

## Хотфикс

Прод горит — от `main`, не от `develop`:

```bash
git checkout main && git pull
git checkout -b hotfix/0.4.1
# минимальная правка + тест, который ловит именно эту поломку
gh pr create --base main --title "hotfix: 0.4.1 — <что чинит>"
# после merge: тег v0.4.1, деплой, и обратный PR в develop
```

**Обратный merge в `develop` не пропускать.** Иначе следующий релиз перезатрёт хотфикс, и
починенный баг вернётся на прод.

## Коммиты

Conventional Commits, как уже сложилось в истории:

```
<тип>(<область>): <что стало по-другому, строчной буквой, без точки>
```

Типы: `feat`, `fix`, `refactor`, `test`, `docs`, `ci`, `chore`, `style`, `perf`.
Области: `booking`, `property`, `cleaning`, `analytics`, `assistant`, `bot`, `miniapp`, `api`, `db`.

```
feat(booking): report what has been paid, and show the money on the phone
fix(assistant): guard the two tools that touch money
test(analytics): authenticate, and stop poisoning the next run
```

Один коммит — одно осмысленное изменение. Не «WIP», не «fixes», не свалка за день.

## Что должно быть зелёным до merge

- `ruff check .` в `day-backend/`
- `pytest` (юнит-тесты, без БД) и `pytest -m integration` (с БД) в `day-backend/`
- `npm run lint` и `npm run build` в `day-frontend/`
- сборка Docker-образов

Всё это гоняет CI (`.github/workflows/ci.yml`) на PR в `main`, `develop` и `release/*`.
Красный CI не мержим — даже «тут же очевидно ничего не сломалось».

## Миграции

Alembic-миграции — часть той же ветки, что и изменение модели. Правила:

- одна голова (head) в `develop`; если после merge их стало две — сделай merge-ревизию;
- миграция должна применяться на копии прод-дампа, а не только на пустой базе;
- перед выкаткой на прод — дамп базы (см. процедуру деплоя).

## Ревью

- PR смотрит второй человек. Самослияние — только для правок в документации.
- PR больше ~400 строк диффа лучше разбить: такое ревью превращается в «lgtm» вслепую.
- Описание PR отвечает на «что менялось и как это проверить», а не пересказывает диффом.
