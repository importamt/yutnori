export type YutResult = 'do' | 'gae' | 'geol' | 'yut' | 'mo' | 'backdo' | 'nak';

export interface YutInfo {
  key: YutResult;
  label: string;
  steps: number;
  /** 한 번 더 던지는가 */
  again: boolean;
  hotkey: string;
  description: string;
}

export const YUT_INFO: Record<YutResult, YutInfo> = {
  do: { key: 'do', label: '도', steps: 1, again: false, hotkey: '1', description: '한 칸' },
  gae: { key: 'gae', label: '개', steps: 2, again: false, hotkey: '2', description: '두 칸' },
  geol: { key: 'geol', label: '걸', steps: 3, again: false, hotkey: '3', description: '세 칸' },
  yut: { key: 'yut', label: '윷', steps: 4, again: true, hotkey: '4', description: '네 칸 · 한 번 더' },
  mo: { key: 'mo', label: '모', steps: 5, again: true, hotkey: '5', description: '다섯 칸 · 한 번 더' },
  backdo: { key: 'backdo', label: '백도', steps: -1, again: false, hotkey: 'B', description: '한 칸 뒤로' },
  nak: { key: 'nak', label: '낙', steps: 0, again: false, hotkey: '0', description: '무효' },
};

export const YUT_ORDER: YutResult[] = ['do', 'gae', 'geol', 'yut', 'mo', 'backdo', 'nak'];
