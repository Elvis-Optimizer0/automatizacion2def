# Modelos de Voz - Origen y Verificación

## Origen de los archivos

Cada modelo puede provenir de dos ubicaciones:

| Ubicación | Prioridad | Descripción |
|-----------|-----------|-------------|
| `userData/models/<id>/<archivo>` | 1 | Archivos importados/descargados por el usuario |
| `userData/models/<archivo>` | 2 | Archivos en ubicación plana (legacy) |
| `vendor/<id>/models/<archivo>` | 3 | Modelos empaquetados con la app (fallback) |
| `vendor/<archivo>` | 4 | Modelos empaquetados en ubicación plana |

## Estados en la UI

- **Instalado y verificado** = archivo existe en userData Y coincide con catálogo (tamaño + SHA-256)
- **Instalado (sin verificar)** = archivo existe en userData pero no se ha verificado SHA-256
- **Verificado (empaquetado)** = archivo no está en userData pero existe en vendor y coincide con catálogo
- **Incompleto** = falta algún archivo en userData
- **Tamaño incorrecto** = archivo existe pero su tamaño no coincide con el catálogo

## Visualización en la lista de modelos

Cada archivo muestra su origen entre paréntesis:
- `(userData)` = archivo en directorio de usuario
- `(empaquetado)` = archivo del vendor (solo lectura)

Ejemplo:
```
kokoro-v1.0.onnx  Listo  (empaquetado)
voices-v1.0.bin   Listo  (userData)
```

## Catálogo oficial (model-specs.js)

| Modelo | Archivo | Tamaño (bytes) | SHA-256 |
|--------|---------|----------------|---------|
| kokoro | kokoro-v1.0.onnx | 325,505,369 | beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a |
| kokoro | voices-v1.0.bin | 28,214,398 | bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d |
| whisper | ggml-base.bin | 147,951,465 | 60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe |

## Verificación

La verificación compara:
1. **Tamaño exacto** (bytes)
2. **SHA-256** (si está definido en catálogo)

Si el archivo en userData no coincide, se usa el de vendor como fallback (solo lectura). El estado "instalado" solo es `true` si el archivo está en userData.