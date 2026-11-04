# Horas semanales

Extensión de Chrome personal (no está en la Chrome Web Store) para un reporte de horas de oficina
de WebFOCUS. El sitio del reporte **no está en el código**: se configura en el popup. Versión
actual: **2.5**.

## Qué hace

- Suma las horas de la tabla **Week Office Hours** (Sun a Sat) de cada persona y muestra cuántas
  faltan para la **meta semanal** (25.5 h por defecto, configurable en el popup).
- Perfiles de mensajes: **Normal**, **Axel mode** y **Tazuki mode** (se eligen en el popup).
  - El texto del perfil solo aplica al primer row. Los demás usan siempre el mensaje normal.
  - Axel y Tazuki muestran una imagen o gif de `media/` (elegido al azar entre los de su carpeta).
- Detecta si el reporte es de la **semana actual**: el año fiscal (`dd-fy`) y la semana fiscal
  (`dd-fw`) seleccionados deben ser los más recientes de sus dropdowns.

### Semana actual

La pantalla se divide en dos recuadros, bajo el dropdown **Persona** (si hay varios rows):

- **Objetivo diario:** día en curso, objetivo de hoy, ajuste activo, hora de llegada, hora de
  salida, contador en vivo y botón de alarma. Se oculta cuando ya se cumplió la meta semanal.
- **Objetivo semanal:** tabla de la semana, meta semanal, horas contadas hasta ayer, leyenda de
  colores y exactitud celular vs oficial.

- El bloque de **hora de llegada** (siempre AM) aparece desde el día 1 (mientras no se cumpla la meta):
  - Hora de salida calculada, redondeada hacia arriba al minuto.
  - Contador en vivo (`Llevas ~X h hoy | Faltan 1 hora y 35 mins ahora (objetivo de hoy: 8.50 h)`).
  - Botón **Setear alarma** (se quita con otro clic) para cumplir el objetivo del día. Solo para
    el primer row, con hora de llegada elegida y **cuando ningún día anterior es asumido** (el
    día 1 no tiene día anterior, así que siempre puede). Así no hay que quitar y volver a poner la
    alarma cuando llegue la hora oficial.
- **Objetivo del día:** el día 1 es la meta semanal entre 3 días de oficina (8.5 h con 25.5 h).
  Cuando un día queda corto o te pasas, el popup permite elegir cómo se ajustan los siguientes
  (**Ajuste del objetivo diario**). Ejemplo con 25.5 h y el día 1 cerrado en 8.0 h:

  | Opción | Qué hace | Día 2 pide |
  |---|---|---|
  | **Repartir entre los días restantes** (por defecto) | `(meta − horas contadas) / días que faltan` | 8.75 h |
  | **Pasar al día siguiente** | Toda la diferencia cae solo en el día siguiente | 9.0 h |

  Con 3 días de oficina, el día 1 y el día 3 dan lo mismo en ambas opciones (el último día es
  siempre lo que falte para la meta semanal): solo cambia el día 2. En el reporte, bajo la tabla,
  se indica qué opción está activa.
- **Días contados** antes de hoy: oficiales (tooltip con horario), festivos/vacaciones (tooltip sin
  horario) y **asumidos** (día con marca de llegada pero sin hora oficial). Un día sin marca ni
  horas no cuenta.
- **Horas que se asumen** en un día sin hora oficial:
  - Si ese día se puso la **alarma**: el objetivo del día con el que se programó (8.5 más o menos
    el ajuste del día anterior). Se anota al poner la alarma y se borra si se quita. No espera a
    que suene.
  - Si no hubo alarma: la meta diaria (meta semanal entre 3, 8.5 con 25.5 h).
  - En ambos casos, cuando llega la hora oficial, esa reemplaza lo asumido.
  - La tabla distingue `Asumido (alarma)` de `Asumido (8.5)` en la fila Fuente, con el mismo color.
- **Tabla de la semana** para la persona seleccionada, con leyenda de colores:

  | Color | Fuente |
  |---|---|
  | Azul | Llegada marcada desde el celular |
  | Naranja | Llegada sobrescrita en el navegador |
  | Verde | Hora oficial de la tabla del reporte |
  | Amarillo | Asumido (llegada sin hora oficial; con alarma o con la meta diaria) |
  | Lila | Festivo/Vacaciones (horas sin horario) |

- Resumen de **exactitud celular vs oficial** (solo primer row): compara la marca del celular con
  la llegada oficial. Las llegadas sobrescritas en el navegador no cuentan.
- En vistas con varios rows hay un dropdown **Persona**. Cada persona guarda sus marcas por día.
- La llegada de hoy del primer row puede venir del **celular** (ver más abajo).

### Semana pasada

Solo se muestran los mensajes por persona. Sin tabla, estimados, alarma ni datos del servidor.
Al terminar se muestra media **success** si se cumplió la meta o **fail** si no.
Si la página no tiene los dropdowns de semana o año, se muestra un aviso y solo los totales.

### Atajos de teclado (escribir en la página, fuera de un campo de texto)

| Texto | Qué hace |
|---|---|
| `DANCE` | Muestra una imagen o gif **success** del perfil (Axel o Tazuki). |
| `ALARMA` | Prueba la notificación de salida (se dispara en 5 segundos). |

## Instalar la extensión

1. Abre `chrome://extensions` y activa **Developer mode**.
2. Pulsa **Load unpacked** y elige esta carpeta.
3. Abre el popup de la extensión. En **General**, escribe el dominio del reporte en **Sitio del
   reporte** (solo el dominio, por ejemplo `reportes.miempresa.com`) y pulsa **Permitir en este
   sitio**. Chrome pide permiso solo para ese sitio. Sin este paso la extensión no hace nada.
4. Recarga la página del reporte.
5. Después de cualquier cambio en el código, pulsa el botón de recargar de la extensión y recarga
   la página del reporte.

El permiso es opcional y solo cubre el dominio que escribas. Si cambias de dominio, Chrome quita el
permiso del anterior. El script se registra dinámicamente (`background.js`), no desde el manifest.

Recargar o actualizar la extensión **borra la alarma programada**. Hay que volver a pulsar
**Setear alarma**.

---

## Sincronizar la hora de llegada desde el celular

Flujo: el celular manda la hora a un Worker de Cloudflare y la extensión la lee al cargar el
reporte. Es necesario porque la VPN impide abrir el reporte desde el celular.

```
Celular → Worker de Cloudflare (KV) ← Extensión (computadora con VPN)
```

- El servidor pone la hora, así que no depende del reloj del celular.
- Guarda **una llegada por día** (se borran solas a las 5 semanas). Con ese historial la
  extensión sabe qué días anteriores tienen marca.
- Si ya hay una hora registrada ese día, el servidor responde `exists` y hay que pedir
  sobrescribirla (`force=1`).
- Las marcas del celular solo aplican al **primer row**. La llegada de hoy se usa para rellenar el
  formulario si es **AM** (la extensión la redondea hacia arriba al minuto).
- Si capturaste la hora de hoy a mano, la tuya gana sobre la del celular.
- Cloudflare KV puede tardar hasta un minuto en reflejar un cambio.
- Si ya tenías el Worker de una versión anterior (una sola llegada), **pega el código nuevo** de
  `worker/worker.js` en el panel y pulsa **Deploy**. Sin eso la extensión no recibe el historial.

### Costo

El plan gratuito de Cloudflare alcanza de sobra para este uso (unos cuantos toques y lecturas al
día) y no pide tarjeta. Confirma los límites vigentes en la página de precios de Cloudflare.

### Paso previo: probar la red del trabajo

Con la VPN activa, abre en Chrome la URL del Worker (cuando la tengas). Si responde
`unauthorized`, la red llega y todo está bien. Si no carga, la red bloquea `workers.dev` y esta
solución no funcionará desde esa computadora.

### Parte 1: Crear el Worker en Cloudflare

El código está en `worker/worker.js` (dentro de esta carpeta).

1. En el panel de Cloudflare ve a **Workers & Pages** → **Create**.
2. **No subas archivos.** El cargador de archivos es el de Pages y falla con
   *"This uploader does not yet support projects that require a build process"*.
3. Las plantillas destacadas (Astro, React Router, Vite React, etc.) no sirven. Busca la plantilla
   **Hello World** entre las opciones.
4. Ponle el nombre `horas-llegada` y pulsa **Deploy**.
5. Pulsa **Edit code**, borra el código de ejemplo, pega el contenido de `worker.js` y pulsa
   **Deploy** de nuevo.

### Parte 2: Crear el namespace de KV y vincularlo

El dropdown del binding solo deja elegir un namespace que ya existe. **No permite crear uno**, así
que se crea primero por separado.

1. Crea un namespace de KV desde la sección de almacenamiento del panel (menú
   **Storage & Databases** → **KV**, el nombre puede variar). Por ejemplo `horas-llegada`.
2. Abre el Worker → **Settings** → **Bindings** → **Add**.
3. En la lista que aparece, elige **KV namespace**. La lista abre con **D1 database**
   seleccionado: no es esa.
4. En **Variable name** escribe exactamente `ARRIVALS` (mayúsculas). El código usa ese nombre.
5. Elige el namespace creado y guarda.

### Parte 3: Variables y secretos

En el Worker → **Settings** → **Variables and Secrets**:

| Nombre | Valor | Tipo |
|---|---|---|
| `KEY` | Una cadena larga y aleatoria | Secret |
| `TZ` | Tu zona horaria, por ejemplo `America/Chihuahua` | Texto |

Después de agregar el binding y las variables, pulsa **Deploy** otra vez para que se apliquen.

### Parte 4: Obtener la URL y probar

La URL del Worker aparece en el **Overview** del Worker, en **Domains & Routes** (el nombre puede
variar). Tiene la forma `https://horas-llegada.TU-SUBDOMINIO.workers.dev`. El dominio `workers.dev`
debe estar activado.

Prueba desde la terminal, sustituyendo la URL y la llave:

```
curl -s "https://TU-URL.workers.dev/arrival?key=TU_KEY"
curl -s -X POST "https://TU-URL.workers.dev/arrive?key=TU_KEY"
curl -s -X POST "https://TU-URL.workers.dev/arrive?key=TU_KEY"
curl -s "https://TU-URL.workers.dev/arrivals?key=TU_KEY"
```

| Respuesta | Significado |
|---|---|
| `{"ts":null}` | Todo bien. Todavía no hay hora registrada hoy. |
| `{"status":"saved","ts":...,"time":"..."}` | Registró la hora (primer POST). |
| `{"status":"exists",...}` | Ya había hora hoy (segundo POST). |
| `{"days":{"2026-11-03":...}}` | Historial de llegadas (lo que lee la extensión). |
| `unauthorized` | La `KEY` no coincide con la guardada en el Worker. |
| Error 1101 de Cloudflare | Falta el binding `ARRIVALS`, o falta desplegar. |

Ojo: la prueba deja registrada una llegada de hoy. Se borra sola al día siguiente. La extensión la
ignora si es PM.

Alternativa por línea de comandos (opcional): `worker/wrangler.toml` está
preparado para `npx wrangler login`, `npx wrangler kv namespace create ARRIVALS` (hay que copiar
el `id` al archivo), `npx wrangler secret put KEY` y `npx wrangler deploy`.

### Parte 5: Configurar la extensión

1. Recarga la extensión. Chrome puede pedir aprobar el permiso de `workers.dev`.
2. Abre el popup. Escribe la URL del Worker en **Endpoint del celular** y la llave en **Key**.
   Ahí mismo está la **Meta semanal** (por usuario; 25.5 por defecto).
3. Recarga el reporte. Si ya hay una hora de llegada AM registrada hoy, las listas se llenan solas.

### Parte 6: Acceso directo en Android (HTTP Shortcuts)

Probado. La app gratuita se llama **HTTP Shortcuts** (Play Store). Sustituye `TU-URL` y `TU_KEY`.

**Acceso 1: Llegada**
1. Pulsa **+** → crear un acceso directo **HTTP Shortcut** (Regular).
2. **Nombre:** `Llegada`. **Método:** `POST`.
3. **URL:** `https://TU-URL.workers.dev/arrive?key=TU_KEY`
4. En **Manejo de respuesta**:
   - **Al éxito:** *Mostrar respuesta*. Las otras opciones son *Mostrar como mensaje* y *No mostrar
     nada (correr silenciosamente)*.
   - **Al fracaso:** *Mostrar mensaje de error detallado*. Un 409 cuenta como fallo, y la versión
     detallada incluye el cuerpo con la hora ya registrada. Las otras opciones son *mensaje de
     error simple* y *silencioso*.
5. Guarda.

**Acceso 2: Llegada (sobrescribir)**
Igual, pero con la URL `https://TU-URL.workers.dev/arrive?key=TU_KEY&force=1`.

Para la pantalla de inicio, mantén pulsado cada acceso dentro de la app y elige **Colocar en
pantalla de inicio**.

Uso: toca **Llegada**. Si ya había hora verás `exists` con la hora registrada. Para corregirla,
toca **Llegada (sobrescribir)**.

### Parte 7: Acceso directo en iOS (Atajos)

**No probado.** Los pasos están armados a partir de lo que devuelve el servidor y los nombres de
las acciones pueden variar según la versión de iOS.

1. Abre **Atajos**, pulsa **+** y nómbralo `Llegada`.
2. **Obtener contenido de URL**, con la URL `https://TU-URL.workers.dev/arrive?key=TU_KEY`. En
   **Mostrar más**, método **POST**.
3. **Obtener valor del diccionario** para la clave `status` del resultado.
4. **Obtener valor del diccionario** para la clave `time` del resultado.
5. **Si** el valor de `status` **es** `exists`:
   1. **Mostrar alerta**: título `Ya registraste a las [time]`, mensaje
      `¿Sobrescribir con la hora actual?`. Si cancelas, el atajo se detiene.
   2. **Obtener contenido de URL** con `...&force=1` y método **POST**.
   3. **Obtener valor del diccionario** para la clave `time` del resultado anterior.
   4. **Mostrar notificación**: `Llegada actualizada: [time]`.
6. **En el Si no**: **Mostrar notificación** con `Llegada registrada: [time]`.
7. Para la pantalla de inicio: detalles del atajo → **Añadir a pantalla de inicio**.

La llave queda dentro de la URL de los accesos directos. No compartas capturas ni los exportes.

---

## Notificaciones de la alarma

La alarma usa notificaciones del sistema. Si pulsas **Setear alarma** y a la hora de salida no ves
nada, escribe `ALARMA` en la página para probar (debe salir en 5 segundos).

**macOS**
1. Ajustes del Sistema → Notificaciones → Google Chrome: activa **Allow notifications**.
2. En **Alert Style** elige **Persistent**. Marca **Desktop**, **Notification Center** y
   **Lock Screen**.
3. Revisa que **No molestar / Focus** no esté activo. Con Focus activo las notificaciones llegan
   al Centro de Notificaciones sin mostrarse. Este fue el problema real durante las pruebas.

**Windows 10 / 11** (no probado)
1. Configuración → Sistema → Notificaciones: activa las notificaciones y, en la lista de apps,
   **Google Chrome** con **Mostrar banners de notificación**.
2. Revisa el **Asistente de concentración** (Windows 10) o **No molestar** (Windows 11). Si están
   activos, las notificaciones quedan en el centro de notificaciones (`Win + N`).
3. Revisa que el **Ahorro de batería** no bloquee las notificaciones.

Si nada de lo anterior funciona, abre `chrome://extensions`, entra a **service worker** en la
tarjeta de la extensión y busca errores en la consola.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `manifest.json` | Configuración, permisos y versión. No lista el sitio del reporte. |
| `.gitignore` | Archivos que no se suben al repositorio (`.DS_Store`, archivos locales de wrangler). |
| `content.js` | Lógica de la página: tabla, mensajes, llegada, contador y atajos. |
| `background.js` | Alarma de salida, notificación y consulta al Worker. |
| `popup.html` / `popup.js` | Popup con cuatro secciones: General, Objetivo semanal, Objetivo diario y Registro hora de llegada. |
| `setup.html` | Guía de Cloudflare y de los accesos directos del celular. Se abre desde el enlace del popup. |
| `icon.png` | Ícono de la extensión y de la notificación. |
| `media/<perfil>/success` y `fail` | Imágenes y gifs de cada perfil (`axel`, `tazuki`). |
| `worker/worker.js` | Código del Worker de Cloudflare. No lo usa Chrome, se pega en Cloudflare. |
| `worker/wrangler.toml` | Configuración opcional para desplegar el Worker con `wrangler`. |

### Agregar o quitar imágenes de un perfil

Copia el archivo a `media/<perfil>/success/` o `media/<perfil>/fail/` y agrégalo a la lista
`MEDIA` de `content.js` (la extensión no puede listar carpetas). Se elige uno al azar de la lista.
Después recarga la extensión.
