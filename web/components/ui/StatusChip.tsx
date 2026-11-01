// Status chip system (C.4): the text label is always present; colour is never the only signal.
export type Tone='ok'|'gated'|'off'|'failed'|'info'|'neutral';
const glyph:Record<Tone,string>={ok:'●',gated:'◐',off:'○',failed:'✕',info:'◆',neutral:'·'};
export default function StatusChip({tone='neutral',children}:{tone?:Tone,children:React.ReactNode}){
 return <span className={`chip status-${tone}`}><span aria-hidden="true" className="chip-glyph">{glyph[tone]}</span>{children}</span>;
}
