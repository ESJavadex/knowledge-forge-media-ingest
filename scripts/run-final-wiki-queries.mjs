#!/usr/bin/env node

const baseUrl = process.argv[2] || 'http://127.0.0.1:3000';
const questions = [
  ['validate-sleep', 'Dime la evidencia para dormir mejor. Sintetiza recomendaciones, consensos, desacuerdos y cautelas con citas por afirmación.'],
  ['validate-longevity', 'Dime las conclusiones que ayuden a incrementar la longevidad. Separa evidencia, recomendaciones, consensos, desacuerdos y cautelas con citas por afirmación.'],
  ['synthesis-borja', 'Crea una síntesis exhaustiva del podcast Dr. Borja Bandera del último año: temas, conclusiones, recomendaciones, contradicciones, límites y citas.'],
  ['synthesis-hernandez', 'Crea una síntesis exhaustiva de Nutrición y Salud con el Dr. Hernández del último año: temas, conclusiones, recomendaciones, contradicciones, límites y citas.'],
  ['synthesis-fitness', 'Crea una síntesis exhaustiva de Radio Fitness Revolucionario del último año: temas, conclusiones, recomendaciones, contradicciones, límites y citas.'],
  ['synthesis-salud-imparable', 'Crea una síntesis exhaustiva de Podcast Salud Imparable del último año: temas, conclusiones, recomendaciones, contradicciones, límites y citas.'],
  ['synthesis-cross-podcast', 'Compara exhaustivamente los cuatro podcasts del último año. Identifica temas dominantes, consensos, contradicciones, recomendaciones recurrentes, incertidumbres y cautelas, con citas por afirmación.'],
];

let failures = 0;
for (const [label, question] of questions) {
  let completed = false;
  for (let attempt = 1; attempt <= 2 && !completed; attempt += 1) {
    process.stdout.write(`${new Date().toISOString()} FINAL_QUERY_START label=${label} attempt=${attempt}\n`);
    try {
      const response = await fetch(`${baseUrl}/api/query`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, mode: 'comprehensive' }),
        signal: AbortSignal.timeout(15 * 60 * 1000),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      process.stdout.write(`${new Date().toISOString()} FINAL_QUERY_END label=${label} result=0 claims=${body.claims ?? 0} page=${JSON.stringify(body.analysisSlug || '')}\n`);
      completed = true;
    } catch (error) {
      process.stderr.write(`${new Date().toISOString()} FINAL_QUERY_RETRY label=${label} attempt=${attempt} error=${JSON.stringify(error.message)}\n`);
    }
  }
  if (!completed) failures += 1;
}

process.stdout.write(`${new Date().toISOString()} FINAL_QUERIES_END failures=${failures} total=${questions.length}\n`);
process.exitCode = failures === 0 ? 0 : 1;
