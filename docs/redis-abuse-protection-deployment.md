# Redis y protección contra abuso

## Variables requeridas

- `REDIS_URL`: URL del Redis administrado. Usar `rediss://` si el proveedor requiere TLS.
- `RATE_LIMIT_HASH_SALT`: secreto estable usado para hashear IPs, emails y user IDs en claves/logs.
- `TRUST_PROXY`: `false` localmente. En producción debe reflejar la infraestructura real del proxy/CDN.

## Límites por defecto

- Global: `120` requests cada `60` segundos por IP.
- Login: `10` intentos por IP y `5` por email/combinación cada `900` segundos.
- Register: `5` por IP y `3` por email cada hora.
- Forgot password: `5` por IP y `3` por email cada hora.
- Refresh: `30` intentos cada `900` segundos por IP.
- Chatbot: `10` mensajes por minuto por usuario y `30` cada 10 minutos por IP.
- IA: `5` escaneos cada 5 minutos por usuario y `10` cada 15 minutos por IP.

## Política ante Redis caído

La primera versión usa `fail-open`: si Redis no está disponible, el backend registra `redis_unavailable` y permite la request. Esto evita botar la API por una caída temporal de Redis, pero implica que los límites temporales quedan desactivados hasta recuperar conexión.

## Contrato `429`

Los límites devuelven:

```json
{
  "code": "RATE_LIMIT_EXCEEDED",
  "scope": "chatbot",
  "limit": 10,
  "remaining": 0,
  "retryAfterSeconds": 42,
  "message": "Demasiadas solicitudes. Intenta nuevamente en unos segundos."
}
```

También se envían `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` y `X-RateLimit-Reset`.
