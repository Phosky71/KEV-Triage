const fs = require('fs');
const p = './docs/audit/FINDINGS.json';
const d = JSON.parse(fs.readFileSync(p));
if (!d.some(x=>x.ID==='FREELLM-001')) {
  d.unshift({
    "ID": "FREELLM-001",
    "Severidad": "Info",
    "Área": "Integración",
    "ArchivoLínea": "server/proxy.mjs,server/freellm-translate.mjs,src/test/*",
    "Descripción": "Integración FreeLLM /v1/decisions con traducción solo en servidor, una sola llamada, conmutable por UPSTREAM_TYPE, sin cambios en adaptador/reglas, secretos solo servidor",
    "Evidencia": "149 tests pasados, tsc --noEmit y build verdes, cobertura freellm-translate 71.42% ramas",
    "Impacto": "Soporte conmutable a FreeLLM manteniendo contrato Kev",
    "CorreccionRecomendada": "Implementado",
    "Esfuerzo": "L",
    "estado": "cerrado",
    "commit": "6665aa8,ecc6962,18a571c,8daf769,9cb61c0,c44bfb6"
  });
  fs.writeFileSync(p, JSON.stringify(d, null, 2));
  console.log('added');
} else {
  console.log('exists');
}
