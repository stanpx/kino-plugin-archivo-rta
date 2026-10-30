# Archivo RTA (Plugin para Kino)

Plugin para [Kino](https://kinotvapp.github.io/kino-plugins/) que permite explorar el acervo histórico audiovisual de Radio y Televisión Argentina (`archivorta.com.ar` / Archivo Prisma) junto con los canales oficiales exclusivos del ecosistema público argentino.

## Contenido y Canales Exclusivos

- **Catálogo de referencia (`archivorta.com.ar`)**:
  - **Documentales**: Material histórico, ciclos culturales e informes especiales.
  - **Series y Programas**: Ciclos documentales y teleteatros clásicos de la TV Pública.
  - **Archivo Histórico**: Momentos clave, noticieros de época y registros institucionales.
  - **Ficción**: Teleteatros y obras dramáticas del archivo.
  - **Espectáculo y Música**: Entrevistas, conciertos y figuras de la cultura argentina.
  - **Últimas actualizaciones**: Novedades y registros recientemente actualizados en `archivorta.com.ar`.
- **Canales Oficiales Exclusivos**:
  - **Archivo Prisma RTA** (`UC8_K7bDkWkuPaKkDTDqVyQw`)
  - **Canal 7 Argentina / TV Pública** (`UCs231K71Bnu5295_x0MB5Pg`)
  - **Canal Encuentro** (`UC1zLDoKL-eKmd_K7qkUZ-ow`)
  - **TV Pública Noticias / Mundo Siete** (`UCqmZBc7T8J5TFuRT5uf-j_g`)
  - **Pakapaka** (`UCVVNYxncuD4EfHpKDlPIYcQ`)
  - **DeporTV** (`UCSmh3DFxBwFurMttT60PQ1g`)
- **Resiliencia (Plan B ante caída de YouTube)**:
  - Respaldo automático mediante espejos de **Invidious** (`invidious.nerdvpn.de`, `inv.nadeko.net`, `invidious.tiekoetter.com`) y **Piped** (`cf.piped.video`, `piped.ducks.party`, `piped.kavin.rocks`, `piped.wireway.ch`), manteniendo siempre el filtrado estricto a los 6 canales oficiales.

## Instalación en Kino

1. En tu teléfono o Android TV, abre **Kino**.
2. Ve a **Ajustes** ▸ **Plugins** (en celulares: menú ☰ ▸ **Plugins**).
3. Toca **Agregar plugin** (botón `+`).
4. Escribe:
   ```text
   stanpx/kino-plugin-archivo-rta
   ```
5. Toca **Agregar** y luego confirma en **Instalar**.

> [!NOTE]
> Este plugin requiere Kino 0.9.66 o superior con soporte para aplicaciones resolutoras (`externalResolve`) para la reproducción de videos.

## Desarrollo y pruebas locales

Validar el manifiesto y firma:
```bash
node sdk/validate.mjs . --repo stanpx/kino-plugin-archivo-rta
```

Probar funciones:
```bash
node sdk/run.mjs . home
node sdk/run.mjs . search "peron"
node sdk/run.mjs . browse "cat:19691"
node sdk/run.mjs . episodes "prog:39092"
node sdk/run.mjs . resolve "yt:Hdubma8hQSc"
```

Ejecutar pruebas unitarias offline:
```bash
node --test test/plugin.test.mjs
```
