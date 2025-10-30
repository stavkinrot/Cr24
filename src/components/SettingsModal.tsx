import React, { useState } from 'react';
import { useChat } from '../context/ChatContext';
import '../styles/SettingsModal.css';

interface SettingsModalProps {
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const { settings, updateSettings } = useChat();
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  const [temperature, setTemperature] = useState(settings.temperature);

  const handleSave = () => {
    updateSettings({ apiKey, model, temperature });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="setting-group">
            <label htmlFor="api-key">OpenAI API Key</label>
            <input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="setting-input"
            />
            <small>Your API key is stored locally and never sent anywhere except OpenAI.</small>
          </div>

          <div className="setting-group">
            <label htmlFor="model">Model</label>
            <select
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value as any)}
              className="setting-select"
            >
              <option value="gpt-5">GPT-5 (Default)</option>
              <option value="gpt-4.1">GPT-4.1</option>
              <option value="gpt-4o">GPT-4o</option>
            </select>
          </div>

          <div className="setting-group">
            <label htmlFor="temperature">
              Temperature: {temperature.toFixed(1)}
            </label>
            <input
              id="temperature"
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="setting-slider"
            />
            <small>Higher values make the output more creative, lower values more focused.</small>
            {model === 'gpt-5' && temperature !== 1 && (
              <small style={{ color: '#dc3545', display: 'block', marginTop: '8px' }}>
                ⚠️ Note: GPT-5 only supports temperature of 1.0
              </small>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
