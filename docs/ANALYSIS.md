# Разбор Abyssal Garden по коду

**Источник:** https://github.com/Noniv/abyssal-garden
**Зафиксированный SHA:** `a596354eff400d458bc2aeb9bdf5e0a9734b2bcf` (коротко `a596354`)
**Коммитов:** 11. **Лицензия:** MIT (`LICENSE:1`, Copyright (c) 2026 Maksymilian Dendura).
**Метод:** клон в `_original_abyssal-garden/`, все строки ниже проверены на этом SHA. Файлы `source/src/*.js`, `source/build.mjs`, `source/template.html`, `prompt.txt` прочитаны целиком; сообщения всех 11 коммитов и issues/PR #1–#8 прочитаны через `gh`.

**Как читать ссылки.** Цитата вида `токен` (файл:строка) означает: на зафиксированном SHA в этой строке literally встречается этот токен. Это машинно проверяется скриптом `docs/evidence/check_links.mjs` (счёт в конце). Пометки:
- **[код]** — прямо прочитано в исходнике/коммите/issue;
- **[вывод]** — моя интерпретация, оценка или следствие, которого в тексте нет.

Все пути относительны корня оригинального репозитория. Цитаты кода приводятся по MIT-лицензии источника.

---

## 1. Технология и стек

**[код]** Это чистый WebGPU + WGSL, без движков. Стартовая проверка: `if (!navigator.gpu) fail` (`source/src/main.js:19`). Адаптер запрашивается с `powerPreference: 'high-performance'` (`source/src/main.js:20`), устройство — с фичей `timestamp-query`, если она есть: `const hasTS = adapter.features.has('timestamp-query')` (`source/src/main.js:23`), `requiredFeatures: hasTS ? ['timestamp-query'] : []` (`source/src/main.js:24`).

**[код]** Стек по факту:
- Canvas-контекст `webgpu`, формат.swapchain = `navigator.gpu.getPreferredCanvasFormat()` (`source/src/main.js:32`).
- HDR-рендер-таргеты `rgba16float`, глубина `depth32float`: `const Q = device.queue, HDR = 'rgba16float', DEPTH = 'depth32float'` (`source/src/main.js:33`).
- WGSL-шейдеры лежат JS-строками с маркером `/*wgsl*/` (`source/src/shaders.js:29` и далее).
- Сборка: Node + esbuild (`source/build.mjs:9` `import { transformSync } from 'esbuild'`), единственная dev-зависимость — esbuild (`source/package.json`, devDependencies).
- Звук: Web Audio API, без сэмплов (`source/src/audio.js:1`–`71`).
- UI: один HTML-шаблон с inline CSS (`source/template.html`).

**[код]** Внешних ассетов нет: ни текстур, ни моделей, ни шрифтов, ни аудиофайлов. Всё генерируется кодом на загрузке (`source/src/world.js:1`–`3`, комментарий «load-time only»). Единственные «файлы» — сам бандл `index.html`.

**[вывод]** Архитектурно это «одностраничный демо-движок»: один асинхронный IIFE, внутри которого последовательно строятся GPU-ресурсы, мир и кадровый цикл. Никакого ECS/сценового графа нет — данные лежат в плоских типизированных массивах, а «сущности» это просто диапазоны инстансов.

---

## 2. Архитектура и порядок сборки

**[код]** Порядок конкатенации модулей задан явно и важен: `const FILES = ['quality.js', 'math.js', 'shaders.js', 'world.js', 'main.js', 'audio.js']` (`source/build.mjs:12`). Для dev-сборки добавляется `dev.js`: `if (dev) FILES.push('dev.js')` (`source/build.mjs:15`).

**[код]** Всё оборачивается в один async-IIFE с перехватом ошибок на экран: `const wrap = (body)` (`source/build.mjs:20`). Поэтому все `const`/`let` модулей — общие лексические переменные одного скоупа; `main.js` напрямую использует `NX`, `W_SOLID`, `makeWorld` и т.д.

**[код]** Роли модулей:
- `quality.js` — выбор уровня качества до постройки чего-либо (`source/src/quality.js:1`–`14`).
- `math.js` — RNG, шум, кватернионы, константы сетки, surface nets, класс `Mesh`, icosphere (`source/src/math.js:1`–`214`).
- `shaders.js` — все WGSL-строки (`source/src/shaders.js:1`–`782`).
- `world.js` — layout мира + процедурная генерация контента и мешей (`source/src/world.js:1`–`557`).
- `main.js` — рендерер, камера, ввод, кадровый цикл (`source/src/main.js:1`–`643`).
- `audio.js` — процедурный эмбиент (`source/src/audio.js`).
- `dev.js` — только в `dev.html`: полёт F и бенчмарк B (`source/src/dev.js:1`–`39`).

**[код]** Последовательность загрузки в `main.js` (по стадиям loading bar):
1. «Compiling shaders…» — создание модулей и пайплайнов (`source/src/main.js:97`).
2. «Sculpting the seabed…» — compute плотности + readback + чистка (`source/src/main.js:144`).
3. «Carving canyons…» — `buildTerrain(D)` (`source/src/main.js:193`–`194`).
4. «Growing kelp…» — `makeWorld(...)` (`source/src/main.js:269`–`270`).
5. «Building set pieces…» — меши, инстанс-буферы, загрузка текстур (`source/src/main.js:274`–`310`).
6. Разовое запекание detail-текстуры и теней (`source/src/main.js:303`–`325`).
7. «Letting the light in…» — первый кадр + `await Q.onSubmittedWorkDone()` (`source/src/main.js:639`–`640`).

**[вывод]** Разделение «генерация на загрузке / ноль работы на кадр» — несущая идея. Генератор отдаёт GPU готовые буферы, после чего его рабочая память освобождается (см. §10).

---

## 3. Рельеф: W_DENS → readback → чистка → surfaceNets → buildTerrain

### 3.1 Сетка и compute
**[код]** Параметры воксельной сетки: `const NX = 512, NY = 80, NZ = 512, VS = 0.75, OX = -192, OY = -56, OZ = -192` (`source/src/math.js:54`). То есть 512×80×512 вокселей, шаг 0.75 м, мир 384×60×384 м с центром в начале координат, дно около y=−56, поверхность y=0. **[вывод]** 512·80·512 = 20 971 520 вокселей; при 4 байта на f32 это ~80 МБ буфера плотности.

**[код]** Compute-шейдер `W_DENS` (`source/src/shaders.js:29`) с workgroup `@compute @workgroup_size(4, 4, 4)` (`source/src/shaders.js:84`). Диспетч: `c.dispatchWorkgroups(NX / 4, NY / 4, NZ / 4)` (`source/src/main.js:160`) = 128×20×128 групп. Каждый поток пишет одну плотность: `D[id.x + u.n.x * (id.y + u.n.y * id.z)] = d` (`source/src/shaders.js:88`). Граничные воксели принудительно вода: `d = -1.;` (`source/src/shaders.js:87`).

**[код]** По плотности `fn dens(p` (`source/src/shaders.js:38`):
- доменное искажение fbm-шумом: `let q = p + w * vec3f(15., 6., 15.)` (`source/src/shaders.js:40`);
- базовый рельеф дна `g0` из двух fbm (`source/src/shaders.js:41`);
- designed-массивы примитивов: mesas (капсулы-сегменты с профилем), arches (торы), holes (туннели), clears (`source/src/world.js:6`, `:21`, `:27`, `:32`), упакованные в storage-буфер `primBuffer()` (`source/src/world.js:45`);
- гладкие min/max: `fn smax`/`fn smin` (`source/src/shaders.js:33`–`34`);
- кольца-плато по радиусу: `let ring = ss(156., 172., rad)` (`source/src/shaders.js:61`), высота `th` до 60 м у кольца (`source/src/shaders.js:63`);
- эрозия worley-шумом и слоистость: `wor(p * .17 + w * 2.)` (`source/src/shaders.js:76`), горизонтальные beds `fract(p.y * .21` (`source/src/shaders.js:77`);
- потолок воды: `return min(d, 3. - p.y)` (`source/src/shaders.js:82`).

**[код]** Примитивы передаются как `array<vec4f>` в storage (`source/src/shaders.js:33`), счётчики — в uniform `c: vec4u` (`source/src/shaders.js:30`). Uniform заполняется в `main.js`: dims, origin, VS и количества MESAS/ARCHES/HOLES/CLEARS (`source/src/main.js:152`–`155`).

### 3.2 Readback
**[код]** Буфер плотности `STORAGE | COPY_SRC`, readback-буфер `MAP_READ | COPY_DST`, копирование и маппинг: `await br.mapAsync(GPUMapMode.READ)` (`source/src/main.js:163`), `D = new Float32Array(br.getMappedRange().slice(0))` (`source/src/main.js:164`). Затем readback- и GPU-буферы уничтожаются (`source/src/main.js:165`).

### 3.3 Удаление «плавающих» кусков
**[код]** Алгоритм (комментарий `source/src/main.js:166`–`168`): камень, связанный с дном, помечается; всё, что не связалось — «speck» и становится водой.
- Один проход в порядке памяти: для каждого столбца непрерывная от дна вверх толща камня помечается связанной; камень над разрывом попадает в список `L`: `L.push(i)` (`source/src/main.js:170`).
- Итеративный flood-fill по 6 соседям со сменой направления: `L.reverse()` (`source/src/main.js:171`), offsets `O = [1, -1, NX, -NX, S, -S]` (`source/src/main.js:169`).
- Несвязавшееся инвертируется в воду: `for (const i of L) if (!R[i]) D[i] = -D[i]` (`source/src/main.js:172`).

**[код]** История (коммиты): `f499baf` «Remove floating terrain specks» — шум оставлял **124** куска по 1–54 вокселя, surface nets делал из них коробки с ломаным шейдингом; чистка ~250 мс на десктопе. `84daf85` «Faster floating-speck removal» — тот же результат (455 вокселей удалено), но sweep только по ~214k вокселям над разрывами; Galaxy A16 ~820→330 мс, десктоп 240→45 мс.

**[вывод]** Это не полноценный 3D connected-components, а гибрид: столбцовый проход + итеративное распространение только по «подозрительному» подмножеству. Дёшево и достаточно для удаления шума, сохраняя настоящие нависания (они связаны через боковых соседей).

### 3.4 surfaceNets на CPU
**[код]** Наивный surface nets: `function surfaceNets(D, nx, ny, nz)` (`source/src/math.js:60`). Для каждого куба читает 8 углов (`source/src/math.js:66`–`69`), строит 8-битную маску знаков `const m = (d0 > 0)` (`source/src/math.js:71`), пропускает пустые/полные `if (m === 0 || m === 255) continue` (`source/src/math.js:72`). Вершина ставится в среднее точек пересечения рёбер с нулём (`source/src/math.js:72`–`85`), индекс вершины пишется в `cur[ci]` (`source/src/math.js:90`). Квады генерируются по трём осям из соседей `cur`/`prev` с翻转 ориентации по знаку (`source/src/math.js:92`–`108`). Буферы растут удвоением (`source/src/math.js:86`, `:90`). Возврат `nv, ni }` (`source/src/math.js:113`).

**[вывод]** Это именно surface nets (одна вершина на куб, квады через соседние кубы), не marching cubes с таблицей 256 случаев. Дешевле по вершинам и даёт сглаженную сетку; нормали потом считаются из градиента поля.

### 3.5 buildTerrain
**[код]** `function buildTerrain(D)` (`source/src/world.js:55`): вызывает surfaceNets (`source/src/world.js:56`), строит трilinear-сэмплер `sampler3(D, NX, NY, NZ)` (`source/src/world.js:57`), для каждой вершины считает нормаль градиентом с шагом `e = 0.8` (`source/src/world.js:60`–`62`), пакует позицию f32x3 + нормаль snorm8x4 в 16 байт (`source/src/world.js:66`–`68`).
**[код]** Квады.bucket-ятся в XZ-сетку отсечения: ключ клетки `key[q] = c` (`source/src/world.js:75`), per-cell диапазоны высот `lo`/`hi` (`source/src/world.js:75`–`77`), counting sort индексов по клеткам (`source/src/world.js:79`–`82`). Возврат `{ vb, ib, nv, wp, wn, smp, start: cnt, lo, hi }` (`source/src/world.js:81`).

---

## 4. Коллизия: разреженные кирпичи 4×4×4 (Int8 CG + Uint16 CI)

**[код]** Параметры: `const CO = 52, CN = 102, CI = new Uint16Array(CN * CN * NY / 4)` (`source/src/main.js:176`), `let CG = new Int8Array(64 * 65534)` (`source/src/main.js:177`). Комментарий (`source/src/main.js:174`–`175`): расстояние до камня в 1/127 м (>0 в камне, clamp ±1 м), хранится только в кирпичах 4×4×4 у поверхности в досягаемости камеры (~2 МБ). CI на кирпич: 0 — всё вода, 1 — всё камень, n — кирпич n−2 в CG.

**[код]** Построение (`source/src/main.js:179`–`190`): обход кирпичей, отсечение дальше 156 м `> 52) continue` (`source/src/main.js:181`); на каждый воксель кирпича — нормализованное градиентом расстояние `q = round(clamp(D[i] / max(l, 0.05), -1, 1) * 127)` (`source/src/main.js:186`), запись в CG (`source/src/main.js:187`), min/max по кирпичу; если весь кирпич однороден (±127) — CI = 0/1, иначе выделяется слот в CG: `lo === hi && lo * lo === 16129` (`source/src/main.js:189`). В конце CG урезается до реально занятого: `CG = CG.slice(0, n * 64)` (`source/src/main.js:191`).

**[код]** Запрос на кадр: `cv(x,y,z)` берёт кирпич из CI и либо константу, либо воксель из CG (`source/src/main.js:505`). `sd(j)` трilinearно интерполирует расстояние в 7 точках (центр + 6 осевых ±0.375 м) (`source/src/main.js:506`–`513`), массив смещений `CE` (`source/src/main.js:504`).

**[код]** `collide()` (`source/src/main.js:515`): движение дробится на шаги короче радиуса `CR = 0.5` (`source/src/main.js:514`), после каждого шага 2 итерации выталкивания по градиенту и гашения нормальной составляющей скорости — скольжение вдоль камня (`source/src/main.js:516`–`527`).

**[вывод]** Это sparse brick SDF-коллизия: однородные кирпичи (вода/камень) занимают 2 байта индекса и ноль байт данных; только приграничные кирпичи хранят 64 байта Int8. Память ~2 МБ вместо ~80 МБ полной сетки, запрос O(1) с трilinear-сглаживанием. Градиент даёт нормаль для скольжения без отдельного меша коллизии.

---

## 5. Отсечение и LOD

**[код]** Сетка отсечения: `const CELLS = 16, CELLW = 24` (`source/src/math.js:55`) — 16×16 клеток по 24 м по XZ (покрывает 384 м). `NCHUNK = 7` мешей камней (`source/src/math.js:56`).

**[код]** `drawCells(r, start, lo, hi, mar, indexed, verts, minD, maxD)` (`source/src/main.js:398`):
- дальность масштабируется `det` кроме рельефа: `const ds = indexed === 1 ? 1 : det * det` (`source/src/main.js:400`);
- обход рядов в порядке «ближние первыми»: `rowOrd` строится от ряда камеры веером (`source/src/main.js:447`);
- на клетку — AABB-тест против дистанции `[minD,maxD)` и грубый frustum-тест через опорные векторы камеры (`source/src/main.js:405`–`414`);
- видимые клетки сливаются в непрерывные серии и рисуются одним вызовом: `if (run < 0) run = c` (`source/src/main.js:417`). Для рельефа `r.drawIndexed(n * 6, 1, a * 6, 0, nSolid)` (`source/src/main.js:419`).

**[код]** LOD водорослей через pipeline-константы `ROWS`: ближние 9 рядов `constants: { ROWS: 9 }` (`source/src/main.js:101`), средние 5 `constants: { ROWS: 5 }` (`source/src/main.js:102`), дальние 3 `constants: { ROWS: 3 }` (`source/src/main.js:104`) и мелочь `constants: { ROWS: 3, FAR: 70 }` (`source/src/main.js:103`). В шейдере `override ROWS: f32 = 7.` (`source/src/shaders.js:383`), `override FAR: f32 = 150.` (`source/src/shaders.js:384`). Дальность LOD-переходов в кадре: 0–24 / 24–58 / 58–150 м (`source/src/main.js:476`–`478`), мелочь 0–70 (`source/src/main.js:479`).

**[код]** Дальние меши камней: крупные chunks рисуются упрощённой версией на 40–150 м `meshes[20 + i], 0, 40, 150` (`source/src/main.js:466`); кораллы LOD на 6–110 м (`source/src/main.js:474`–`475`). Дальний буфер водорослей прорежен ×2 и шире: `bigF: pack(big, 2, 1.5)` (`source/src/world.js:390`).

**[код]** Видимость водорослей дополнительно гасится в вершинном шейдере по дистанции: `let far = FAR * g.mis.z` (`source/src/shaders.js:435`), `nearK`/`farK` (`source/src/shaders.js:436`–`437`).

**[вывод]** Двухуровневое отсечение: CPU решает «какие клетки/серии рисовать» (сокращает draw calls и вершины), GPU-шейдер additionally гасит дальние листья (сокращает overdraw). Слитные серии — ключ к малому числу draw calls при сотнях тысяч инстансов.

---

## 6. Форматы вершин и инстансов (до байта)

**[код]** Вершины «твёрдых» мешей — 16 байт: `const vbSolid = { arrayStride: 16, attributes: [A(0, 0, 'float32x3'), A(1, 12, 'snorm8x4')] }` (`source/src/main.js:80`). Позиция f32x3 (12 Б) + нормаль snorm8x4 (4 Б), в normal.w кладётся aux-параметр (AO/ span-координата) — см. `Mesh.build` `s[k*16+15] = round(clamp(this.aux[k],-1,1)*127)` (`source/src/math.js:189`).

**[код]** Инстансы:
- `ibSolid` — 48 байт: `arrayStride: 48` (`source/src/main.js:81`), три float32x4: a=(pos.xyz, scale), b=(quat), c=(mat, seed, texScale, bob). Заполнение в `solid(...)`: `q[0], q[1], q[2], q[3], mat, seed, ts, bob` (`source/src/world.js:98`).
- `ibLeaf` — 36 байт: `arrayStride: 36` (`source/src/main.js:82`), два float32x4 + unorm8x4: a=(pos.xyz,len), b=(yaw,tilth,width,hA), c=(type,s1,s2,bend) в 4 байтах. Упаковка `pack(...)`: 8 float + 4 unorm8 (`source/src/world.js:327`–`339`), `u8[k*36+32] = a[i+8]` (type) и т.д. (`source/src/world.js:336`).
- `ibAnim` — 32 байта: `arrayStride: 32` (`source/src/main.js:83`), два float32x4: a=(center.xyz, R), b=(seed, omega, scale, phase). Рыбы: `fish.push(s[0], s[1], s[2], s[3], rnd(), s[6]*1.9/s[3], s[5], ss)` (`source/src/world.js:371`); манты 8 float (`source/src/world.js:373`).
- `ibBub` — 32 байта: `arrayStride: 32` (`source/src/main.js:84`), a=(pos.xyz,size), b=(seed,speed,height,wobble).
- `ibSnow` — 16 байт: `arrayStride: 16` (`source/src/main.js:85`), один float32x4 случайных чисел (`source/src/world.js:376`–`377`).

**[код]** Все меши сливаются в один вершинный и один индексный буфер с оффсетами: `m.v0 = nV; m.i0 = nI` (`source/src/main.js:285`), `allV = new Uint8Array(nV * 16)` (`source/src/main.js:286`), `vbMesh`/`ibMesh` (`source/src/main.js:288`). Рисование конкретного меша — `meshes[i].ib.length, g[1], meshes[i].i0, meshes[i].v0, g[0]` (`source/src/main.js:462`).

**[вывод]** 16-байтная вершина и 32–48-байтные инстансы — агрессивная упаковка: нормали snorm8, цвета/типы unorm8. Это снижает bandwidth vertex fetch и позволяет держать сотни тысяч инстансов в нескольких МБ.

---

## 7. Пайплайны и граф кадра

### 7.1 Пайплайны
**[код]** Фабрика сценовых пайплайнов `scenePipe` (`source/src/main.js:87`): общий layout `pl0`, HDR-таргет, reverse-Z `depthCompare: 'greater'` (`source/src/main.js:91`), MSAA `multisample: { count: AA }` (`source/src/main.js:91`), `depthWriteEnabled: !o.blend` (`source/src/main.js:91`).

**[код]** 13 сценовых пайплайнов через `scenePipe`:
1. `pTerrain` (cull back) (`source/src/main.js:99`)
2. `pSolid` (`source/src/main.js:100`)
3. `pLeaf` ROWS 9 (`source/src/main.js:101`)
4. `pLeaf5` ROWS 5 (`source/src/main.js:102`)
5. `pLeafS` ROWS 3, FAR 70 (`source/src/main.js:103`)
6. `pLeafF` ROWS 3 (`source/src/main.js:104`)
7. `pFish` (`source/src/main.js:105`)
8. `pManta` (`source/src/main.js:106`)
9. `pSurf` + 10. `pBack` (`source/src/main.js:107`)
11. `pBub` (alpha blend) (`source/src/main.js:108`)
12. `pSnow` (additive) (`source/src/main.js:110`)
13. `pGl` (additive, ROWS 7) (`source/src/main.js:111`)

**[код]** 3 теневых через `shadowPipe` (`source/src/main.js:92`): `depthCompare: 'less'`, `depthBias: 2, depthBiasSlopeScale: 1.5` (`source/src/main.js:95`): `pSolidSh`, `pTerrSh` (cull front) (`source/src/main.js:112`), `pLeafSh` ROWS 3 (`source/src/main.js:113`).

**[код]** Плюс fullscreen-пайплайны: blit/mip/bloom `const pMip8 = blitPipe` (`source/src/main.js:74`); вода `pWater` (`source/src/main.js:116`); лучи `pRays`, размытие `pRB`, пост `pPost` (`source/src/main.js:122`–`124`); compute `W_DENS` (`source/src/main.js:151`) и запекание detail (`source/src/main.js:304`).

### 7.2 Bind group сцены
**[код]** `bgl0` — 9 биндингов (`source/src/main.js:56`–`62`): 0 uniform `G`; 1 sampler repeat; 2 sampler clamp; 3 comparison-sampler; 4 depth-текстура теней; 5 tWater; 6 tDetail; 7 3D tVol; 8 tMap. Структура `G`: `struct G { vp: mat4x4f, sm: mat4x4f` (`source/src/shaders.js:193`), uniform 240 байт (`source/src/main.js:52`).

### 7.3 Порядок проходов кадра
**[код]** `render()` (`source/src/main.js:425`) собирает один command encoder:
1. **Вода + мипы.** Анимированная текстура воды в mip0: `r.setPipeline(pWater)` (`source/src/main.js:454`), затем 4 mip-прохода `pMip16` (`source/src/main.js:455`).
2. **Сцена** (`passScene`, MSAA→resolve) (`source/src/main.js:457`–`485`): рельеф `drawCells` до 240 м (`source/src/main.js:460`), 12 set-piece мешей (`source/src/main.js:461`–`462`), chunks/камни с LOD (`source/src/main.js:463`–`471`), губки/кораллы (`source/src/main.js:472`–`475`), манты (`source/src/main.js:476`), рыбы (`source/src/main.js:477`), водоросли 9/5/3 рядов (`source/src/main.js:476`–`479`), поверхность воды `pSurf` (`source/src/main.js:480`), фон `pBack` (`source/src/main.js:481`), пузыри `pBub` (`source/src/main.js:482`), блики `pGl` (`source/src/main.js:483`), снег `pSnow` (`source/src/main.js:484`).
3. **Лучи в полразрешения** `passRays` (`source/src/main.js:487`), затем **размытие** `passBlur` (`source/src/main.js:488`).
4. **Bloom**: 6 down-проходов + 5 up-проходов (additive) (`source/src/main.js:490`–`492`), цепочка `NB = 6` (`source/src/main.js:336`).
5. **Пост/композит** в swapchain `passPost` (`source/src/main.js:494`–`496`).
6. Resolve timestamp-запросов и submit (`source/src/main.js:497`–`499`).

**[код]** Timestamp-метки ставятся на первый (вода) и последний (пост) проходы: `waterPass[0].timestampWrites = slot ? tsBegin : undefined` (`source/src/main.js:451`), `passPost.timestampWrites = slot ? tsEnd` (`source/src/main.js:452`) — измеряется весь GPU-кадр целиком.

**[вывод]** Граф кадра: water→mips→scene(MSAA)→rays(half)→blur→bloom(6↓5↑)→post. Это классический HDR-пайплайн с отложенными volumetrics и bloom, но без G-buffer: сцена сразу в HDR-цвет, лучи читают depth. Reverse-Z (`greater`) + depth32float даёт точность глубины на 240 м.

---

## 8. Свет

### 8.1 Разовое запекание теней и detail
**[код]** Тень — одна статическая depth-текстура `tex(SHADOW, SHADOW, DEPTH` (`source/src/main.js:44`), `SHADOW = LV ? 2048 : 4096` (`source/src/quality.js:14`). Запекается один раз на загрузке в один render pass (`source/src/main.js:312`–`324`): рельеф + solids (`source/src/main.js:314`–`318`), мелкие камни/губки/кораллы **только на High** — комментарий «~35M triangles ... too much for a phone's driver» (`source/src/main.js:319`), водоросли `pLeafSh` (`source/src/main.js:322`).
**[код]** Солнечная матрица ортографическая: `R = 225, d0 = -175, d1 = 125` (`source/src/main.js:132`), направление `const v = [0.27, 1, -0.24]` (`source/src/main.js:128`).
**[код]** Detail-текстура `tDetail` 1024², rgba8unorm, 11 мипов (`source/src/main.js:47`), запекается процедурным шейдером `W_DETAIL` (`source/src/shaders.js:98`) + mip-цепочка (`source/src/main.js:304`–`311`). Каналы: rg=slope, b=height, a=mottling (`source/src/shaders.js:97`).

**[код]** Выборка теней на кадр: `shadow1` (`source/src/shaders.js:231`), `shadow4` (4 tap) (`source/src/shaders.js:232`), `shadow9` (9 tap, на Low → 1 tap) (`source/src/shaders.js:237`–`242`).

### 8.2 3D-текстура tVol
**[код]** `tex(NX / 2, NY / 2, 'rg8unorm'` (`source/src/main.js:48`) — 3D 256×40×256, 2 канала. Заполняется на CPU: r=openness, g=skylight (`source/src/world.js:342`–`356`), свет распространяется сверху вниз с blur и поглощением водорослями `kelpAbs` (`source/src/world.js:352`–`354`). Загрузка `Q.writeTexture({ texture: tVol }, Wd.volD` (`source/src/main.js:299`). Выборка `fn vol(p)` нормирует координаты в [0,1] по миру 384×60×384 (`source/src/shaders.js:258`).

### 8.3 Туман и поглощение
**[код]** Константы поглощения/рассеяния (`source/src/shaders.js:194`–`198`):
- `const SIG = vec3f(.058, .0235, .0195)` (`source/src/shaders.js:194`) — рассеяние;
- `const KD = vec3f(.056, .0245, .0170)` (`source/src/shaders.js:195`) — поглощение по глубине;
- `const WCOL = vec3f(.16, .58, .90)` (`source/src/shaders.js:196`) — цвет воды;
- `const KDZ = vec3f(.034, .023, .018)` (`source/src/shaders.js:197`), `const PCOL = vec3f(.58, .66, .98)` (`source/src/shaders.js:198`) — фиолетовая зона.
**[код]** Интеграл тумана `fogIn` (`source/src/shaders.js:210`): аналитический `let I = (1. - exp(-a * d)) / a` (`source/src/shaders.js:213`), фазовая функция `1.22 + .3 * m2 * m2` (`source/src/shaders.js:216`). Итоговый `fn fog(c: vec3f, wp: vec3f, z: f32) (`source/src/shaders.js:266`): затухание сцены `ss(230., 185., d)` и подмешивание haze; skylight читается не дальше 150 м — `min(d, 150.)` (`source/src/shaders.js:268`).
**[код]** Солнечный свет по глубине `SUNC * exp(kd(z)` (`source/src/shaders.js:257`), ambient `amb` (`source/src/shaders.js:259`), боковой `side` (`source/src/shaders.js:264`), зона `zone` mixes tMap.b (`source/src/shaders.js:263`).

**[вывод]** Красный канал поглощается сильнее всего (SIG.r=.058 ≫ SIG.b=.0195; KD.r=.056 ≫ KD.b=.017) — поэтому на глубине всё сине-зелёное, а красный почти исчезает. Это физически мотивированная модель Beer–Lambert с раздельными коэффициентами по каналам. Важно для нашего красного кальмара (§15, ТЗ).

### 8.4 Каустика
**[код]** Анимированная каустика генерируется в текстуру воды `W_WATER` (`source/src/shaders.js:162`): итеративная функция `fn caus(uv: vec2f, t: f32)` (`source/src/shaders.js:164`), 5 итераций, `pow(abs(c), 8.)`. На поверхностях проецируется вдоль солнца: `return p.xz - g.sun.xz * (p.y / g.sun.y)` (`source/src/shaders.js:243`), `caus(p,d)` с 3 сэмплами и затуханием к 100 м (`source/src/shaders.js:244`–`250`), дешёвый `caus2` для листьев (`source/src/shaders.js:252`).

### 8.5 Поверхность воды снизу
**[код]** `fn fs(i: VO) -> @location(0) vec4f {` (`source/src/shaders.js:591`): окно Снелла `let k = 1. - 1.769 * (1. - ci * ci)` (`source/src/shaders.js:597`), `win = ss(0., .22, k)` (`source/src/shaders.js:598`), преломление `refract(V, n, 1.33)` (`source/src/shaders.js:599`), Френель `fr = pow(1. - sqrt(max(k,0.)), 5.)` (`source/src/shaders.js:601`), смесь отражённого тумана и неба (`source/src/shaders.js:606`).

---

## 9. Живность: рыбы и манты (без симуляции)

**[код]** Никакой CPU/compute-симуляции нет: позиции и анимация целиком в вершинных шейдерах от времени `g.cam.w`. Инстанс — 8 float (32 Б, `ibAnim`, §6).

### 9.1 Рыбы `vsFish`
**[код]** (`source/src/shaders.js:504`–`520`):
-.seed `s = i.b.x`, три хэша `h = vec3f(hs(s), hs(s+.37), hs(s+.71))` (`source/src/shaders.js:506`);
- орбита: `ta = t * i.b.y + i.b.w * 6.3 + (h.x-.5) * (26./R)` (`source/src/shaders.js:508`);
- центр школы `P = i.a.xyz + vec3f(R*cos(ta), 2.2*sin(3.*ta+ph), R*.6*sin(ta))` (`source/src/shaders.js:510`) — эллипс с вертикальной волной;
- касательная `T = normalize(vec3f(-R*sin(ta), 6.6*cos(3.*ta+ph), R*.6*cos(ta))) * sign(i.b.y)` (`source/src/shaders.js:511`), базис S/Up (`source/src/shaders.js:512`);
- разброс особи `off` (`source/src/shaders.js:513`);
- хвостовая волна: `l.z += sin(t*9. + s*50. + l.x*5.) * .22 * (.25*i.b.z - l.x)` (`source/src/shaders.js:515`) — бегущая по телу (l.x) синусоида, амплитуда растёт к хвосту;
- мир `w = P + off + T*l.x + Up*l.y + S*l.z` (`source/src/shaders.js:516`), тень `shadow1(w)` (`source/src/shaders.js:518`).
**[код]** Школы заданы таблицей `SCH` (12 школ, 300–520 рыб) (`source/src/world.js:369`–`371`).

### 9.2 Манты `vsManta`
**[код]** (`source/src/shaders.js:531`–`553`):
- орбита `P = i.a.xyz + vec3f(R*cos(ta), 2.5*sin(2.*ta+i.b.w), R*.75*sin(ta))` (`source/src/shaders.js:535`);
- крен `bank = -.28 * sign(i.b.y)` (`source/src/shaders.js:538`);
- взмах крыльев по span-координате `u = i.n.w` (aux вершины): `fp = t*1.25 + i.b.w*5. - au*1.2` (`source/src/shaders.js:541`), `amp = .36 * pow(au, 1.6)` (`source/src/shaders.js:542`), `l.y += amp * sin(fp)` (`source/src/shaders.js:544`) — амплитуда растёт к кончикам, фаза запаздывает к кончикам (бегущая волна);
- поворот нормали крыла `sl = (.576*pow(au,.6)*sin(fp) - .43*pow(au,1.6)*cos(fp)) * sign(u)` (`source/src/shaders.js:547`);
- хвост `tail` (`source/src/shaders.js:544`–`545`).
**[код]** Меш манты — параметрическая поверхность (72×22) + хвост + головные плавники, aux = span-координата (`source/src/world.js:526`–`548`). 6 мант (`source/src/world.js:373`).

**[вывод]** «Анимация без симуляции»: каждая особь — детерминированная функция времени и seed. Ноль состояния на кадр, ноль аллокаций, идеально параллельно. Цена — нет взаимодействия особей/средой (рыбы не огибают камни). Для нашего проекта это отправная точка, но крабам нужна посадка на рельеф (§15, ТЗ).

---

## 10. Кадровый цикл: ноль аллокаций и регулятор

**[код]** Всё per-frame состояние в одном преаллоцированном массиве: `const F = new Float64Array(32), P6 = new Float64Array(6)` (`source/src/main.js:236`), именованные индексы `const CX = 0, CY = 1` (`source/src/main.js:237`). Комментарий: «per-frame float state lives in one preallocated array, so the frame loop allocates no heap numbers» (`source/src/main.js:235`). Камера, скорости, время, GPU-мс — всё в F.

**[код]** `frame(now)` (`source/src/main.js:531`): dt clamp 0.1 (`source/src/main.js:534`); ввод/сглаживание мыши двумя low-pass (`source/src/main.js:556`–`562`); движение с экспоненциальным сглаживанием скорости (`source/src/main.js:564`–`568`); ограничение мира rad>150 и y∈[−52,−1.2] (`source/src/main.js:569`–`570`); `collide()` (`source/src/main.js:572`); `render()` (`source/src/main.js:574`).

**[код]** GPU-тайминг: querySet из 2 timestamp (`source/src/main.js:375`), 6 readback-буферов по кругу (`source/src/main.js:376`–`388`), результат в `F[GPU]` (`source/src/main.js:382`).

**[код]** Регулятор разрешения/дальности (`source/src/main.js:535`–`551`): раз в ~1 с (0.4 с за меню) считает среднее GPU `g`; цель — держать GPU в полосе 9.8–13.6 мс: `if (g > 13.6 || g < 9.8) k = 11.7 / g` (`source/src/main.js:539`). Без timestamp — по CPU-времени кадра (`source/src/main.js:541`–`543`). Коэффициент clamp [0.5,1.7] (`source/src/main.js:544`). Сначала меняются пиксели `pix`, потом дальность `det` (`source/src/main.js:546`–`549`), `det *= sqrt(k)` (`source/src/main.js:549`). Пределы: `PIXMAX = 2560*1440`, `DETMIN = 0.4` (`source/src/main.js:333`). Устоявшиеся значения пишутся в localStorage (`source/src/main.js:550`).

**[код]** Освобождение памяти генератора: `D = Wd.gy = T.smp = null` (~200 МБ) (`source/src/main.js:272`), после загрузки буферов — ещё ~300 МБ (`source/src/main.js:326`–`328`).

**[вывод]** Ноль аллокаций достигается тем, что (а) всё состояние в типизированных массивах, (б) анимации — чистые функции времени в шейдере, (в) инстанс-буферы статичны. Единственные per-frame аллокации — command encoder и bind group view в `render()` (`source/src/main.js:448`, `:495`), это объекты WebGPU, не JS-куча чисел. **[вывод]** Строго «ноль JS-аллокаций» относится к числовому состоянию/математике; GPU-объекты кадра создаются (это неизбежно в WebGPU без кэша encoder'ов).

---

## 11. Уровни качества (quality.js)

**[код]** `LV: 0 High, 1 Medium, 2 Low` (`source/src/quality.js:4`). Выбор: `LV = SV[0] ? +SV[0] : mob ? (mem > 7 ? 1 : 2) : mem <= 4 ? 2 : 0` (`source/src/quality.js:12`). Crash-detection: если `abyssalLoad` остался с прошлой загрузки — уровень ниже (`source/src/quality.js:13`).
**[код]** Константы от уровня: `const THIN = 1 << LV, SHADOW = LV ? 2048 : 4096, AA = LV > 1 ? 1 : 4, WATER = LV > 1 ? 256 : 512, RAYN = LV > 1 ? 12 : 34` (`source/src/quality.js:14`).
- THIN: каждый 2-й/4-й лист/блик/галька (`source/src/world.js:94`);
- SHADOW: 4096→2048;
- AA: MSAA 4×→1× на Low;
- WATER: 512→256;
- RAYN: 34→12 шагов лучей.
**[код]** На Low также грубее меши (`meshChunk` sub-- при LV>1, `source/src/world.js:396`), дешевле фильтрация (`maxAnisotropy: LV > 1 ? 1 : 8`, `source/src/main.js:41`), тени 1-tap (`source/src/shaders.js:238`), нет теней мелких камней (`source/src/main.js:319`–`321`).

---

## 12. Сборка в один HTML + минификация WGSL

**[код]** `build.mjs`: конкатенация FILES (`source/build.mjs:17`), оборачивание в IIFE (`source/build.mjs:20`). Минификация WGSL внутри `/*wgsl*/`-литералов: `const minWgsl = (s)` (`source/build.mjs:27`) — убирает комментарии, схлопывает пробелы и вырезает пробелы вокруг операторов; применяется ко всем wgsl-литералам регуляркой (`source/build.mjs:28`). JS минифицируется esbuild `target: 'es2022'` (`source/build.mjs:29`), CSS тоже (`source/build.mjs:30`). Отчёт о размере и gzip (`source/build.mjs:34`–`35`).

**[код]** Замер размера (на этой машине, SHA a596354):
- blob `index.html` в git: **99 514 байт** (`git cat-file -s HEAD:index.html`);
- рабочая копия с CRLF: 99 522 байт; пересборка `npm run build` даёт тот же контент (git diff пуст);
- консоль сборки: `index.html: 97.2 kB, 39.3 kB gzipped`;
- README заявляет **96 KB** (`README.md:6`), описание репо — **97 KB**.
**[вывод]** 99 514 Б = 97.18 КиБ ≈ 97 KB (описание репо совпадает). README «96 KB» — заниженное/устаревшее округление (ни 96 КиБ, ни 96 kB не выходят из 99 514 Б). Расхождение README — косметика, не баг.

---

## 13. Звук (Web Audio)

**[код]** Фиксированный граф, строится по первому клику/ключу/тачу, драйвер — таймер 10 Гц, не кадровый цикл (`source/src/audio.js:4`–`5`). Слои: rumble, surface wash, water rush (следует за скоростью камеры), drone, bubbles, chimes, distant whale calls (`source/src/audio.js:5`).
**[код]** Браун-шум без шва (cross-fade конца в начало) (`source/src/audio.js:17`), реверб-импульс 5 с `const ir = noise(5` (`source/src/audio.js:19`), компрессор-лимитер (`source/src/audio.js:22`), пулы голосов osc→env→pan (`source/src/audio.js:33`), пентатоника D-dur (`source/src/audio.js:42`). Мастер `VOL = 0.78` (~−18.5 LUFS) (`source/src/audio.js:7`). Mute на M (`source/src/audio.js:70`).

---

## 14. Замеры на GTX 1080 Ti (эта машина)

**Метод.** `cd source && npm install && npm run build:dev`; `dev.html` открыт в Chrome 157.0.8103.51 через CDP; viewport 2560×1440 @ DPR 1 (`Emulation.setDeviceMetricsOverride`); пресет `localStorage.abyssal='0,3686400,1'` (High, полный бюджет пикселей, det=1); клавиша B запускает 60-секундный пролёт (`source/src/dev.js:30`–`36`). Авторитетный лог — отчёт dev.js (`source/src/dev.js:15`); независимый кросс-чек — injected zero-alloc rAF-логгер. Сырые данные: `docs/evidence/benchmark_raw.json`, `benchmark_report.txt`, `console.log`.

**Проверка GPU (до замера).** `chrome://gpu` (`docs/evidence/chrome_gpu.txt`): WebGPU = Hardware accelerated; Dawn Info = `<Discrete GPU> D3D12 backend - NVIDIA GeForce GTX 1080 Ti`; ACTIVE-адаптер `VENDOR=0x10de, DEVICE=0x1b06 [NVIDIA GeForce GTX 1080 Ti]`; `GL_RENDERER = ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Ti ... D3D11)`. Microsoft Basic Render Driver присутствует в списке, но **не активен**. WebGPU-проба (`docs/evidence/webgpu_adapter.json`): `vendor:"nvidia", architecture:"pascal"`, фича `timestamp-query` доступна. **Вывод: рендер идёт на 1080 Ti, не на Remote Display/софте.** (Desktop compositing в chrome://gpu = SOFTWARE — это композитор RDP-сессии, не GPU рендера сцены.)

**Результат 60-секундного пролёта (High, 2560×1440):**

| Метрика | avg | p99 | max |
|---|---|---|---|
| GPU-кадр (timestamp-query), мс | **10.83** | **14.88** | **17.96** |
| Кадр (rAF), мс | **16.82** | **75.80** | **106.80** |

- Кадров: 3570 за 60.3 с; canvas 2560×1440; уровень High (LV=0).
- Независимый rAF-логгер: avg 16.87 / p99 75.90 / max 106.80 мс — совпадает с отчётом dev.js.
- Консоль: без GPU-ошибок и исключений; benign-предупреждения: `powerPreference ignored on Windows` (crbug 369219127), 404 favicon, `AudioContext was not allowed to start` (autoplay-политика, т.к. клик синтетический). См. `console.log`.

**[вывод]** GPU avg 10.83 мс ≈ 92 fps GPU-потолок; кадр avg 16.82 мс ≈ 60 fps — упор в вертикальную синхронизацию дисплея (RDP ~60 Гц), а не в GPU. GPU p99 14.88 / max 17.96 мс — ровный. CPU-кадр p99 75.8 / max 106.8 мс — редкие длинные кадры (вероятно планировщик ОС/RDP или first-use компиляция); на GPU это не отражается. Автор мерил RTX 5070 Ti ~180 fps @1440p (prompt.txt TARGET) — у нас GPU примерно вдвое медленнее, но всё ещё с запасом относительно 60 Гц дисплея.

**Скриншоты шести ракурсов (клавиши 1–6):** `docs/evidence/pose1.png` … `pose6.png` (2560×1440). pose1 — каменный хвост кита (meshFluke) среди келпа; подтверждает рендер на 1080 Ti. Плюс `fly_mid.png` (кадр пролёта).

**Размер бандла:** см. §12 — 99 514 Б (git blob), 97.2 КиБ, 39.3 КиБ gzip.

---

## 15. Чего в оригинале нет, а нам нужно

**[код] + [вывод]** По каждому пункту — что есть в оригинале и чего не хватает:

1. **Киты.** В оригинале нет живого кита — есть только каменная скульптура хвоста `meshFluke()` (`source/src/world.js:442`), SDF из tapered capsules → surface nets, материал «whale fluke: smooth pale stone» (`source/src/shaders.js:338`). Живых китов нет. **Нам нужен** анимированный кит: вертикальный мах хвостом, грудные плавники, крупный меш, траектория.
2. **Акулы.** Нет ни меша, ни шейдера акулы. Ближайшее — рыбы `meshFish`/`vsFish` (`source/src/world.js:549`, `source/src/shaders.js:504`). **Нам нужна** акула с боковой бегущей волной по телу (приём как у рыб, но крупнее и с иным профилем).
3. **Крабы (ход по дну).** Нет ничего, что ходит по рельефу. Вся живность плавает по аналитическим орбитам (§9). Коллизия есть только для камеры (§4). **Нам нужен** краб: посадка на рельеф по карте высот/SDF, наклон по нормали, фазы ног, ход боком.
4. **Кальмары.** Нет. **Нам нужен** красный кальмар: пульс мантии, реактивные рывки, щупальца; и шейдинг красного в воде, поглощающей красный (§8.3).
5. **Текст и шрифты.** В оригинале нет ни одного 3D-текста/шрифта; UI-текст — HTML/CSS (`source/template.html`). **Нам нужна** надпись «#вайбкодеры» по дну, заданная кодом (штрихи/SDF), без файлов шрифтов.
6. **Высота воды 60 м.** Мир по Y: OY=−56, поверхность 0, потолок `min(d, 3.-p.y)` (`source/src/shaders.js:82`), камера ограничена y∈[−52,−1.2] (`source/src/main.js:570`). useful водный столб ~52 м. **[вывод]** Для кита длиной ~12–16 м и махом хвоста ±2–3 м высоты 60 м хватает с запасом, если кит держится глубже −10 м; но манёвр по вертикали ограничен. В ТЗ фиксируем габарит кита и коридор плавания так, чтобы 60 м было достаточно (см. ARCHITECTURE.md).

---

## 16. На чём автор споткнулся (по коммитам)

**[код]** Хронология проблем и фиксов:

1. **Запекание теней роняло GPU на телефоне.** Коммит `f2f6638`: «the one-time shadow bake (about 45M triangles in one pass) made the driver lose the GPU device, leaving a black scene» (Galaxy A16). Фикс: уровни качества, на Medium/Low нет теней мелких камней/кораллов, 2048 тень; crash-detection понижает уровень. В коде: `// small rocks, sponges and corals (~35M triangles) only on High: too much for a phone's driver` (`source/src/main.js:319`); device.lost → reload ниже (`source/src/main.js:27`–`31`).
2. **124 «плавающих» куска породы.** Коммит `f499baf`: шум оставлял 124 куска (1–54 вокселя), surface nets делал коробки с ломаным шейдингом. Фикс — flood-fill от дна (§3.3). Ускорение `84daf85` (820→330 мс на A16).
3. **Чёрный фон дальше 240 м.** Коммит `c628d18`: рельеф рисуется до ~240 м, но вид у поверхности/в каньоне достаёт до ~330 м, где ничего не нарисовано и виден чёрный clear. Фикс — fullscreen-фон `vsB`/`fsB`, рисующий haze 240 м (`source/src/shaders.js:610`–`619`), и fog читает skylight ≤150 м (`source/src/shaders.js:268`), чтобы дальний рельеф и фон сходились без контура.
4. **Issue #7** (`arboveiri`, OPEN): «Failed to start: A valid external Instance reference no longer exists.» — ошибка старта WebGPU у пользователя. **[вывод]** Это сообщение уровня браузера/драйвера (инстанс Vulkan/Dawn потерян), не JS-баг сцены; в коде обработка device.lost есть (`source/src/main.js:27`), но она ловит потерю устройства, а не провал создания инстанса на старте. Прямой связи с конкретным фиксом в коммитах нет — issue открыт.

**[код]** Прочее из коммитов: `b6c8335` — меню/загрузка/динамическое разрешение, бенчмарк вынесен в dev.js; `63b42cd` — коллизия; `846ccd6` — отзывчивый touch, подсказка Chrome; `a596354` — формулировка подсказки «optimal experience rather than performance» (в других браузерах сцена может не запуститься вовсе).

---

## 17. Issues / PR #1–#8 (прочитаны через gh)

**[код]**
- **#1** (ozghosty, OPEN, PR): WebXR VR — стерео WebGPU+WebXR, per-eye проходы, WebGL2-blit мост, контроллеры. Не слит.
- **#2** (LordDeatHunter, OPEN, PR): индикатор джойстика на мобильном.
- **#3** (bdbais, OPEN, PR): «Abyssal Crew» — опциональный мультиплеер (лобби до 8, WebRTC-голос, находки), отдельная сборка `build:crew`, хуки в main.js под `typeof NET`.
- **#4** (richardsj, CLOSED, PR): «Reef life and bluer water» — вариация с 8 формами рыб, bait balls, анемонами; открыт по ошибке против этого репо, живёт в форке.
- **#5** (mikuni99, OPEN, PR): фикс отрицательных `Touch.identifier` на iOS home-screen (`identifier >>> 0`), проверено через CDP.
- **#6** (chihyun-yang, CLOSED): «School» — пустое тело.
- **#7** (arboveiri, OPEN): ошибка старта WebGPU (см. §16.4).
- **#8** (evanrobinson2, OPEN, show-and-tell): две космические сцены на коде оригинала (Nebula Reef, Hollow Asteroid), переиспользуют math.js и приёмы (fog, HDR+MSAA, reverse-Z, instancing, bloom, GPU-timed resolution, zero-alloc). Не PR.

**[вывод]** #8 и #4 подтверждают: приёмы оригинала переносимы на другие сцены — это и есть наш план (взять приёмы, не код). #5 — полезный урок про touch-идентификаторы, если будем делать мобильный ввод.

---

## 18. Выводы для нашего проекта

**[вывод]**
1. Берём архитектурный каркас: один HTML, WebGPU+WGSL, генерация на загрузке, ноль числовых аллокаций на кадр, инстансинг + cell-отсечение + LOD, reverse-Z HDR, запечённая тень + 3D-vol, аналитический туман Beer–Lambert, bloom, GPU-timed регулятор.
2. Живность оригинала — чистые функции времени; для крабов этого мало (нужна посадка на рельеф), для китов/акул/кальмаров — достаточно, но с нашими формулами (§9 → ТЗ).
3. Красный кальмар требует явной компенсации поглощения красного канала (§8.3): либо ближе к поверхности, либо локальная подсветка/эмиссия, иначе на глубине он станет чёрным.
4. Риски автора (§16) закладываем в ТЗ как явные ворота: бюджет теней на запекание, чистка плавающих кусков, фон за дальностью, обработка device.lost.
5. Бюджеты производительности берём из наших замеров на 1080 Ti (§14): GPU avg ≤ ~11 мс, p99 ≤ ~15 мс как ориентир для 60 fps с запасом; см. ARCHITECTURE.md.

---

*Все цитаты кода — из Noniv/abyssal-garden @ a596354, лицензия MIT. Разбор и выводы — для проекта AGY_Aqua_webGPU.*
