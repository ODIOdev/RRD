# RR AutoDetailing Reservas — MVP

Primera versión funcional de la aplicación de reservas.

## Incluye
- Registro de clientes y vehículos.
- Catálogo de servicios con precio regular y precio después de las 6:00 p. m.
- Selección de lavador.
- Filtro automático de brilladores para servicios especializados.
- Horarios distintos para domingo.
- Control básico de solapamiento de reservas.
- Propinas.
- Pago en efectivo, tarjeta, transferencia o reserva sin pago.
- Regla configurable de 18% para pagos con tarjeta.
- Penalidad de RD$100 por cancelación, aplicada en la próxima reserva.
- Estados de reserva.
- Panel administrativo.
- Alta de nuevos servicios.
- Almacenamiento local en el dispositivo.
- Instalación como PWA.

## Cómo abrirla
Para probarla de forma sencilla:
1. Abra una terminal en esta carpeta.
2. Ejecute: `python -m http.server 8000`
3. Abra `http://localhost:8000`

También puede subir la carpeta a Netlify, Vercel o cualquier hosting estático.

## Importante para producción
Esta versión guarda datos solo en el dispositivo mediante localStorage. Para uso real con múltiples clientes y empleados debe conectarse a una base de datos y autenticación, por ejemplo Supabase.

La aplicación fue estructurada para añadir módulos posteriormente:
- WhatsApp
- pagos en línea
- facturación
- inventario
- membresías
- fidelidad
- fotos antes/después
- comisiones
- varias sucursales


## Actualización v2
- Edición de servicios existentes desde Administración.
- Modificación de nombre, precio regular, precio nocturno, duración y requisito de brillador.
- Eliminación de servicios que todavía no tengan reservas relacionadas.
- Campo para guardar, copiar y abrir el enlace público que se enviará a los clientes.


## Actualización visual v3
- Logo oficial integrado en la cabecera, pie de página, favicon e instalación PWA.
- Imagen de fondo oficial integrada en la portada y el fondo general.
- Paleta visual negra, blanca y naranja.
- Botón directo de WhatsApp.
- Portada adaptable a celular y computadora.
