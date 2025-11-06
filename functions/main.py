from __future__ import annotations

import os
import json
import hashlib
from datetime import datetime, timezone
from typing import Any, Iterable, List, Dict, Optional

import requests

from firebase_functions import scheduler_fn, https_fn
from firebase_functions.options import set_global_options
from firebase_admin import initialize_app
from firebase_admin import firestore as admin_fs

# ---------- Opciones globales ----------
set_global_options(
    region="europe-west1",
    max_instances=5,
    timeout_sec=120,
    secrets=["AEMET_API_KEY"]  # 👈 añade esto aquí
)

# ---------- AEMET: predicción por CCAA (hoy) ----------
AEMET_BASE = "https://opendata.aemet.es/opendata/api/prediccion/ccaa/hoy"
# ---------- AEMET helpers ----------
def _resolve_aemet_key(req: https_fn.Request) -> str:
    """
    Intenta obtener la API key de AEMET en este orden:
      1) Env var (Functions Gen2 con secrets, o .env.local en emulador)
      2) Cabecera HTTP 'x-aemet-key' (útil para pruebas locales o curl)
      3) Query string ?key=... o ?apiKey=...
    Lanza RuntimeError si no encuentra ninguna.
    """
    # 1) Entorno (lo normal en producción con secrets)
    env_key = os.getenv("AEMET_API_KEY")
    if env_key:
        return env_key.strip()

    # 2) Header
    hdr_key = req.headers.get("x-aemet-key")
    if hdr_key:
        return hdr_key.strip()

    # 3) Query
    qs_key = req.args.get("key") or req.args.get("apiKey") or req.args.get("apikey")
    if qs_key:
        return qs_key.strip()

    raise RuntimeError("AEMET_API_KEY not found (env|header|query).")

def _get_secret(name: str) -> str:
    """
    Lee un secreto expuesto como variable de entorno en Functions Gen2.
    En Firebase Console → Build → Functions → Secrets, vincula AEMET_API_KEY
    a esta función para que aparezca como env var.
    """
    val = os.getenv(name)
    if not val:
        raise RuntimeError(f"Secret env var '{name}' not found.")
    return val

def _fetch_aemet_ccaa_hoy(ccaa: str, api_key: str) -> dict:
    """
    1) GET AEMET .../ccaa/hoy/{ccaa}?api_key=...  -> devuelve JSON con 'datos' (URL temporal)
    2) GET a 'datos' -> devuelve el JSON real (a veces text/plain con JSON dentro)
    Retorna un dict serializable.
    """
    # Primer salto: metadatos con URL de descarga
    url = f"{AEMET_BASE}/{ccaa}"
    r1 = requests.get(
        url,
        params={"api_key": api_key},
        headers={"cache-control": "no-cache"},
        timeout=30,
    )
    r1.raise_for_status()
    meta = r1.json()
    datos_url: Optional[str] = meta.get("datos")
    if not datos_url:
        raise RuntimeError(f"Respuesta AEMET sin 'datos': {meta}")

    # Segundo salto: descarga real
    r2 = requests.get(datos_url, timeout=30)
    r2.raise_for_status()
    try:
        payload = r2.json()
    except ValueError:
        payload = {"raw": r2.text}

    # Normaliza salida
    if isinstance(payload, list):
        return {"ccaa": ccaa, "data": payload, "source": url}
    elif isinstance(payload, dict):
        payload.setdefault("ccaa", ccaa)
        payload.setdefault("source", url)
        return payload
    else:
        return {"ccaa": ccaa, "data": payload, "source": url}
    
def _cors_response(body: str, status: int = 200, mimetype: str = "application/json") -> https_fn.Response:
    resp = https_fn.Response(body, status=status, mimetype=mimetype)
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return resp
# Inicializa Admin SDK una vez por contenedor
_app = None
def _get_db():
    global _app
    if _app is None:
        _app = initialize_app()
    return admin_fs.client()

# ---------- Config de la API ----------
URL = "https://servicio.mapa.gob.es/regfiweb/Exportaciones/ExportJsonProductos"

HEADERS = {
    "Accept": "*/*",
    "Accept-Language": "es-ES,es;q=0.9",
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "Origin": "https://servicio.mapa.gob.es",
    "Referer": "https://servicio.mapa.gob.es/regfiweb/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, como Gecko) Chrome/141.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest",
}

# Mueve las cookies a un secreto/var de entorno si puedes (JSON tipo {"_ga":"...","_gid":"..."}).
# Si defines MAPA_COOKIES='{"_ga":"..."}' en Secret Manager/vars de Firebase:
COOKIES = json.loads(os.getenv("MAPA_COOKIES", "{}")) or {
    "_gid": "GA1.3.1295578295.1761156780",
    "_dc_gtm_UA-121160996-1": "1",
    "_dc_gtm_UA-121160996-2": "1",
    "_ga_2V2T5QNMCX": "GS2.1.s1761156779$o1$g1$t1761156842$j60$l0$h0",
    "_ga": "GA1.3.588007663.1761156780",
    "_ga_39YRSEJH6H": "GS2.3.s1761156779$o1$g1$t1761156844$j58$l0$h0",
}

FORM_DATA = {
    "dataDto[nombreComercial]": "",
    "dataDto[titular]": "",
    "dataDto[numRegistro]": "",
    "dataDto[fabricante]": "",
    "dataDto[idSustancia]": "-1",
    "dataDto[idPlaga]": "-1",
    "dataDto[idFuncion]": "-1",
    "dataDto[idEstado]": "1",
    "dataDto[idCultivo]": "-1",
    "dataDto[idSistemaCultivo]": "-1",
    "dataDto[idTipoUsuario]": "-1",
    "dataDto[ancestrosCultivos]": "false",
    "dataDto[ancestrosPlagas]": "false",
    "dataDto[fecRenoDesde]": "",
    "dataDto[fecRenoHasta]": "",
    "dataDto[fecInscDesde]": "",
    "dataDto[fecInscHasta]": "",
    "dataDto[fecModiDesde]": "",
    "dataDto[fecModiHasta]": "",
    "dataDto[fecCaduDesde]": "",
    "dataDto[fecCaduHasta]": "",
    "dataDto[fecLimiDesde]": "",
    "dataDto[fecLimiHasta]": "",
}

# ---------- Utilidades ----------
def _maybe_decode(value: Any) -> Any:
    """Decodifica JSON anidado cuando llega como string."""
    if isinstance(value, str):
        s = value.strip()
        if s and s[0] in "{[":
            try:
                return _maybe_decode(json.loads(s))
            except json.JSONDecodeError:
                return value
        return value
    if isinstance(value, list):
        return [_maybe_decode(v) for v in value]
    if isinstance(value, dict):
        return {k: _maybe_decode(v) for k, v in value.items()}
    return value

def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _hash_doc_id(obj: Any) -> str:
    """ID determinista para deduplicar (sha1 del JSON ordenado)."""
    blob = json.dumps(obj, ensure_ascii=False, sort_keys=True)
    return hashlib.sha1(blob.encode("utf-8")).hexdigest()

def _chunked(iterable: Iterable[Any], size: int) -> Iterable[List[Any]]:
    chunk: List[Any] = []
    for item in iterable:
        chunk.append(item)
        if len(chunk) >= size:
            yield chunk
            chunk = []
    if chunk:
        yield chunk

# ========= ENDPOINTS A PROCESAR =========
ENDPOINTS = [
    {
        "name": "productos",
        "collection": "regfi_productos",
        "url": "https://servicio.mapa.gob.es/regfiweb/Exportaciones/ExportJsonProductos",
        "method": "POST",
        "headers": HEADERS,
        "cookies": COOKIES,
        "data": FORM_DATA,
        "items_keys": ["Contenido", "items", "data", "results"],
    },
    {
        "name": "formulados",
        "collection": "regfi_formulados",
        "url": "https://servicio.mapa.gob.es/regfiweb/Exportaciones/ExportJsonFormulados",
        "method": "POST",
        "headers": HEADERS,
        "cookies": COOKIES,
        "data": {
            "dataDto[nombreFormulado]": "",
            "dataDto[idFuncion]": "",
            "dataDto[idAccion]": "",
            "dataDto[idSustancia]": "",
            "dataDto[idPreparado]": "",
        },
        "items_keys": ["Contenido", "items", "data", "results"],
    },
    {
        "name": "sustancias",
        "collection": "regfi_sustancias",
        "url": "https://servicio.mapa.gob.es/regfiweb/Exportaciones/ExportJsonSustancias",
        "method": "POST",
        "headers": HEADERS,
        "cookies": COOKIES,
        "data": {
            "dataDto[nombreSustancia]": "",
            "dataDto[idFuncion]": "",
            "dataDto[idAccion]": "",
            "dataDto[idPreparado]": "",
        },
        "items_keys": ["Contenido", "items", "data", "results"],
    },
    {
        "name": "cultivos",
        "collection": "regfi_cultivos",
        "url": "https://servicio.mapa.gob.es/regfiweb/Exportaciones/ExportJsonCultivos",
        "method": "POST",
        "headers": HEADERS,
        "cookies": COOKIES,
        "data": {
            "dataDto[nombreComun]": "",
            "dataDto[nombreLatin]": "",
            "dataDto[codigoEppo]": "",
            "dataDto[idAgente]": "",
            "dataDto[Agente]": "",
        },
        "items_keys": ["Contenido", "items", "data", "results"],
    },
]


# ---------- Lógica principal ----------
def fetch_and_parse(ep: dict) -> Any:
    """Llama al endpoint (GET/POST) y normaliza JSON anidado."""
    method = ep.get("method", "GET").upper()
    url = ep["url"]
    headers = ep.get("headers") or {}
    cookies = ep.get("cookies") or {}
    data = ep.get("data")

    if method == "POST":
        r = requests.post(url, headers=headers, cookies=cookies, data=data, timeout=60)
    else:
        r = requests.get(url, headers=headers, cookies=cookies, params=data, timeout=60)
    r.raise_for_status()
    return _maybe_decode(r.json())

def save_snapshot_and_items(payload: Any, ep: dict) -> Dict[str, Any]:
    db = _get_db()
    """
    Guarda:
      - Un snapshot en 'regfi_snapshots' (solo metadatos).
      - Cada elemento en 'regfi_productos' con ID determinista y lastSeenAt.
    Evita documentos gigantes (límite 1 MiB): no mete el payload entero en un único doc.
    """
    now = _utc_now_iso()

    # Crea snapshot base
    snap_ref = db.collection("regfi_snapshots").document()
    snapshot_doc = {
        "createdAt": now,
        "source": ep["url"],
        "endpoint": ep.get("name"),
        "type": type(payload).__name__,
        "itemsCount": 0,
    }

    # Fan-out si payload es lista o si hay un campo 'Contenido' lista dentro de un dict
    items: List[Any] = []
    if isinstance(payload, list):
        items = payload
    elif isinstance(payload, dict):
        # Heurística: intenta campo 'Contenido' u otros comunes
        for key in ("Contenido", "contenido", "items", "data", "results"):
            val = payload.get(key)
            if isinstance(val, list):
                items = val
                break

    upserted = 0
    if items:
        col = db.collection(ep["collection"])
        # Batches de ~450 para margen < 500 operaciones por batch
        for batch_items in _chunked(items, 450):
            batch = db.batch()
            for item in batch_items:
                doc_id = _hash_doc_id(item)
                doc_ref = col.document(doc_id)
                batch.set(
                    doc_ref,
                    {
                        "snapshotId": snap_ref.id,
                        "lastSeenAt": now,
                        "data": item,
                    },
                    merge=True,  # idempotente
                )
                upserted += 1
            batch.commit()

    # Actualiza snapshot con conteo
    snap_ref.set(
        {"itemsCount": upserted, "finalizedAt": now},
        merge=True
    )

    return {
        "snapshotId": snap_ref.id,
        "itemsCount": upserted,
        "createdAt": now,
        "endpoint": ep.get("name"),
        "collection": ep.get("collection"),
    }

# ---------- Triggers ----------

# Opción 1: PROGRAMADA (semanal, lunes 06:00 Europe/Madrid)
@scheduler_fn.on_schedule(schedule="0 6 * * 1", timezone="Europe/Madrid")
def regfi_snapshot_weekly(_: scheduler_fn.ScheduledEvent) -> None:
    totals = []
    for ep in ENDPOINTS:
        try:
            payload = fetch_and_parse(ep)
            result = save_snapshot_and_items(payload, ep)
            print(f"[weekly] {result['endpoint']} → {result['itemsCount']} items (snap {result['snapshotId']})")
            totals.append(result)
        except Exception as e:
            print(f"[weekly][ERROR] {ep.get('name')} ({ep.get('url')}): {e}")
    print(json.dumps({"ok": True, "totals": totals}, ensure_ascii=False))

# Opción 2: HTTP manual (útil para pruebas o cron externo)
@https_fn.on_request()
def regfi_snapshot_http(req: https_fn.Request) -> https_fn.Response:
    try:
        totals = []
        for ep in ENDPOINTS:
            payload = fetch_and_parse(ep)
            result = save_snapshot_and_items(payload, ep)
            totals.append(result)
        return https_fn.Response(
            json.dumps({"ok": True, "totals": totals}, ensure_ascii=False),
            mimetype="application/json",
            status=200,
        )
    except Exception as e:
        return https_fn.Response(
            json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False),
            mimetype="application/json",
            status=500,
        )
# ---------- Endpoint AEMET CCAA (hoy) ----------
@https_fn.on_request()
def aemet_ccaa_hoy(req: https_fn.Request) -> https_fn.Response:
    """
    Endpoint HTTP para pedir AEMET CCAA (hoy).

    Formatos aceptados:
      - Ruta con segmento final:  /aemet/ccaa/<CCAA>
        Ej: https://.../aemet_ccaa_hoy/aemet/ccaa/MU
      - Query string:            ?ccaa=MU

    Devuelve JSON.
    """
    if req.method == "OPTIONS":
        return _cors_response("", status=204)

    # Extrae CCAA desde la ruta o la query
    path = (req.path or "").strip("/")
    parts = [p for p in path.split("/") if p]
    ccaa = None
    try:
        idx = parts.index("ccaa")
        if idx + 1 < len(parts):
            ccaa = parts[idx + 1]
    except ValueError:
        pass

    if not ccaa:
        ccaa = req.args.get("ccaa")

    if not ccaa:
        return _cors_response(json.dumps({"ok": False, "error": "Falta parámetro CCAA (en ruta o ?ccaa=)"}), status=400)

    try:
        api_key = _resolve_aemet_key(req)
        data = _fetch_aemet_ccaa_hoy(ccaa.upper(), api_key)
        return _cors_response(json.dumps(data, ensure_ascii=False))
    except Exception as e:
        err = {"ok": False, "error": str(e), "ccaa": ccaa}
        return _cors_response(json.dumps(err, ensure_ascii=False), status=500)