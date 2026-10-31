import React from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from '../../src/App';
import '../../src/index.css';

const params = new URLSearchParams(location.search);
const width = Number(params.get('width'));
const root = createRoot(document.getElementById('root')!);
if (width > 0 && !params.has('frame')) {
  params.delete('width'); params.set('frame', '1');
  root.render(<iframe title={`${width}px responsive preview`} src={`?${params}`} style={{ width, height: 940, border: 0, display: 'block' }} />);
} else {
  root.render(<React.StrictMode><MotionConfig reducedMotion="user"><App /></MotionConfig></React.StrictMode>);
}
