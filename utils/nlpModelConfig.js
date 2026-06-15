const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'nlp-model-config.json');

const DEFAULT_CONFIG = {
  activeModelId: 'bert',
  selectionMode: 'auto',
  task: 'classification_sentiment_fr',
  updatedAt: null,
  updatedBy: null,
};

let memoryConfig = { ...DEFAULT_CONFIG };

const ensureDataDir = () => {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const loadConfig = () => {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      memoryConfig = { ...DEFAULT_CONFIG, ...raw };
    }
  } catch {
    memoryConfig = { ...DEFAULT_CONFIG };
  }
  return { ...memoryConfig };
};

const saveConfig = (patch = {}) => {
  memoryConfig = { ...memoryConfig, ...patch, updatedAt: new Date().toISOString() };
  try {
    ensureDataDir();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(memoryConfig, null, 2), 'utf8');
  } catch (err) {
    console.warn('nlpModelConfig: persistance fichier ignorée', err.message);
  }
  return { ...memoryConfig };
};

loadConfig();

const MODEL_LABELS = {
  bert: 'BERT multilingue',
  lstm: 'LSTM',
  gru: 'GRU',
};

module.exports = {
  loadConfig,
  saveConfig,
  getConfig: () => ({ ...memoryConfig }),
  MODEL_LABELS,
  DEFAULT_CONFIG,
};
