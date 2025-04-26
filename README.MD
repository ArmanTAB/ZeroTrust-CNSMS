Development of corporate network security management system based on Zero Trust.

Backend api functions:

Устройства (/devices):

GET /devices/ - получить все устройства
GET /devices/{device_id} - получить устройство по ID
GET /devices/{device_id}/risk - получить оценку риска устройства
POST /devices/register - зарегистрировать устройство
PUT /devices/{device_id} - обновить информацию об устройстве
PUT /devices/{device_id}/status - обновить статус устройства


Доступ (/access):

GET /access/logs - получить логи доступа
GET /access/statistics - получить статистику доступа
POST /access/request - запросить доступ
POST /access/log - логировать доступ