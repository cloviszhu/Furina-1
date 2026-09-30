// Capabilities must describe implemented behavior, not desired future features.
export const SPEECH_BACKENDS = [
  { id: 'windows-sapi', label: 'Windows 本机系统声 · 测试备用', reference: false, emotion: false, stream: false, cancel: true, pcm: true },
  { id: 'browser', label: '浏览器本机系统声 · 测试备用', reference: false, emotion: false, stream: false, cancel: true, pcm: false },
];

export function validateSpeechOptions(input, backend = 'windows-sapi') {
  const capability = SPEECH_BACKENDS.find(b => b.id === backend);
  if (!capability) throw new Error('语音后端未接入。');
  if (input.referenceId && !capability.reference) throw new Error('当前系统声不支持参考录音或声线克隆。');
  if (input.emotion && input.emotion !== 'neutral' && !capability.emotion) throw new Error('当前系统声不支持真实情绪控制。');
  if (input.stream && !capability.stream) throw new Error('当前系统声不支持流式生成。');
  return capability;
}
