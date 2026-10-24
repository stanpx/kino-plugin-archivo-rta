# Archivo RTA (Plugin para Kino)

Plugin para [Kino](https://kinotvapp.github.io/kino-plugins/) que permite explorar el acervo histórico audiovisual de Radio y Televisión Argentina (Archivo RTA / Archivo Prisma).

## Contenido

- **Documentales**: Material histórico, ciclos culturales e informes especiales.
- **Series y Programas**: Ciclos documentales y teleteatros clásicos de la TV Pública.
- **Archivo Histórico**: Momentos clave, noticieros de época y registros institucionales.
- **Ficción**: Teleteatros y obras dramáticas del archivo.
- **Espectáculo y Música**: Entrevistas, conciertos y figuras de la cultura argentina.

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
