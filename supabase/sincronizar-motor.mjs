// Copia el motor de la tasadora a la función de Supabase.
//
//   node supabase/sincronizar-motor.mjs            copia «new-version/js/presupuesto-motor.js» a
//                                                   «supabase/functions/_shared/presupuesto-motor.js»
//   node supabase/sincronizar-motor.mjs --comprobar solo comprueba que la copia está al día (no escribe nada)
//
// La función «solicitar-presupuesto» rehace con ese motor los gramos y el tiempo de cada solicitud (precio al momento
// no falsificable). Si el motor cambia (cualquier fórmula o coeficiente), hay que:
//   1. subir MOTOR_REVISION al final de presupuesto-motor.js,
//   2. ejecutar este script,
//   3. redesplegar la función:  supabase functions deploy solicitar-presupuesto --no-verify-jwt
// El script se niega a copiar un motor modificado sin que haya cambiado MOTOR_REVISION. Mientras la web y la función
// tengan revisiones distintas, la función no da precio al momento (la solicitud pasa a revisión del equipo).
import fs from 'fs'; import path from 'path'; import crypto from 'crypto'; import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ORIGEN = path.join(AQUI, '..', 'new-version', 'js', 'presupuesto-motor.js');
const DESTINO_DIR = path.join(AQUI, 'functions', '_shared');
const DESTINO = path.join(DESTINO_DIR, 'presupuesto-motor.js');
const SELLO = path.join(DESTINO_DIR, 'presupuesto-motor.sello.json');

const leer = () => fs.readFileSync(ORIGEN, 'utf8').replace(/\r\n/g, '\n');
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
const revision = (t) => (/export const MOTOR_REVISION = '([^']+)'/.exec(t) || [])[1];

const texto = leer(), h = hash(texto), rev = revision(texto);
if (!rev) { console.error('No encuentro MOTOR_REVISION en el motor.'); process.exit(1); }
const sello = fs.existsSync(SELLO) ? JSON.parse(fs.readFileSync(SELLO, 'utf8')) : null;
const CABECERA = /^\/\/ COPIA AUTOMÁTICA[^\n]*\n/;
const copia = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, 'utf8').replace(CABECERA, '') : null;
const alDia = copia !== null && hash(copia) === h;

if (process.argv.includes('--comprobar')) {
  if (alDia) { console.log('La copia de la función está al día (revisión ' + rev + ').'); process.exit(0); }
  console.error('LA COPIA DE LA FUNCIÓN NO ESTÁ AL DÍA con el motor de la web. Ejecuta: node supabase/sincronizar-motor.mjs');
  process.exit(1);
}
if (alDia) { console.log('Nada que copiar: la función ya tiene este motor (revisión ' + rev + ').'); process.exit(0); }
if (sello && sello.revision === rev && sello.hash !== h) {
  console.error('El motor ha cambiado desde la última copia pero MOTOR_REVISION sigue siendo «' + rev + '».\nSúbela (p. ej. a una nueva fecha) al final de presupuesto-motor.js y vuelve a ejecutar este script.');
  process.exit(1);
}
fs.mkdirSync(DESTINO_DIR, { recursive: true });
fs.writeFileSync(DESTINO, '// COPIA AUTOMÁTICA de new-version/js/presupuesto-motor.js (node supabase/sincronizar-motor.mjs). No editar aquí.\n' + texto);
fs.writeFileSync(SELLO, JSON.stringify({ revision: rev, hash: h }, null, 1) + '\n');
console.log('Copiado. Revisión del motor: ' + rev + '.\nAhora redespliega la función:  supabase functions deploy solicitar-presupuesto --no-verify-jwt');
