import json
import re
import urllib.error
import urllib.request

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
}

ALLOWED = {
    'getMe', 'sendMessage', 'getWebhookInfo', 'setWebhook', 'deleteWebhook', 'getUpdates',
}
TOKEN_RE = re.compile(r'^\d{5,15}:[A-Za-z0-9_-]{30,64}$')


def reply(payload: dict, status: int = 200) -> dict:
    return {'statusCode': status, 'headers': CORS, 'body': json.dumps(payload, ensure_ascii=False)}


def handler(event: dict, context) -> dict:
    """Посредник для Telegram Bot API: пересылает запросы бота с хостингов, где доступ к api.telegram.org закрыт."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}
    if event.get('httpMethod') != 'POST':
        return reply({'ok': False, 'description': 'method_not_allowed'}, 405)

    try:
        body = json.loads(event.get('body') or '{}')
    except ValueError:
        return reply({'ok': False, 'description': 'bad_json'}, 400)

    token = str(body.get('token') or '').strip()
    method = str(body.get('method') or '')
    payload = body.get('payload') if isinstance(body.get('payload'), dict) else {}
    if not TOKEN_RE.match(token):
        return reply({'ok': False, 'description': 'bad_token'}, 400)
    if method not in ALLOWED:
        return reply({'ok': False, 'description': 'method_not_allowed'}, 400)

    req = urllib.request.Request(
        f'https://api.telegram.org/bot{token}/{method}',
        data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json'},
    )
    try:
        raw = urllib.request.urlopen(req, timeout=4).read()
    except urllib.error.HTTPError as err:
        raw = err.read()
    except Exception as err:
        return reply({'ok': False, 'description': f'relay_failed: {err}'}, 502)
    try:
        data = json.loads(raw)
    except ValueError:
        return reply({'ok': False, 'description': 'bad_telegram_response'}, 502)
    return reply(data if isinstance(data, dict) else {'ok': False})
