/**
 * Benchmark interactif des architectures ML (séries CA).
 * Usage : npm run ml:benchmark
 *         npm run ml:benchmark -- --synthetic
 */
const { runMlBenchmark, SYNTHETIC_SERIES } = require('../services/mlBenchmark.service');
const { forecastWithAutoModel } = require('../ml/autoSelect');

const useLive = process.argv.includes('--live');

const main = async () => {
  console.log('\n🧪 PetfoodTN — Test architectures ML (prévision ventes)\n');
  console.log(useLive ? 'Mode : données commandes (DB)\n' : 'Mode : série synthétique (sans DB)\n');

  const benchmark = await runMlBenchmark({ monthsBack: 12, useSynthetic: !useLive });

  let productionForecast;
  if (!useLive) {
    const auto = forecastWithAutoModel(SYNTHETIC_SERIES, 3);
    productionForecast = {
      model: auto.model,
      modelLabel: auto.modelLabel,
      modelBenchmark: auto.modelBenchmark,
      metrics: auto.metrics,
    };
  } else {
    const { runFullMlReport } = require('../services/mlBenchmark.service');
    const report = await runFullMlReport({ monthsBack: 12, horizon: 3, useSynthetic: false });
    productionForecast = report.productionForecast;
  }

  console.log(`Points de données : ${benchmark.dataPoints}`);
  console.log(`Méthode sélection : ${benchmark.reason} (hold-out = ${benchmark.validationHoldout})\n`);
  console.log('Classement (validation) :');
  console.log('─'.repeat(72));
  console.log(
    `${'Rang'.padEnd(5)}${'Modèle'.padEnd(28)}${'MAPE %'.padEnd(10)}${'RMSE'.padEnd(10)}R²`
  );
  console.log('─'.repeat(72));

  for (const row of benchmark.benchmark) {
    console.log(
      `${String(row.rank).padEnd(5)}${row.label.padEnd(28)}${String(row.mape ?? '—').padEnd(10)}${String(row.rmse ?? '—').padEnd(10)}${row.r2 ?? '—'}${row.selected ? '  ✓ retenu' : ''}`
    );
  }

  console.log('─'.repeat(72));
  console.log(`\n✅ Modèle retenu en production : ${productionForecast.modelLabel} (${productionForecast.model})`);
  console.log(`   R²=${productionForecast.metrics?.r2 ?? '—'}  MAPE=${productionForecast.metrics?.mape ?? '—'}%\n`);
};

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
