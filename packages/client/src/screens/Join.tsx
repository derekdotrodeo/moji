import { useRef, useState } from 'react';
import type { GameClient } from '../useGame.js';
import { AVATARS } from '../data/avatars.js';
import { Eyebrow, Panel, StickerButton, cn } from '../ui.js';

const CODE_LEN = 5;

interface Props {
  mode: 'create' | 'join';
  initialCode?: string;
  game: GameClient;
  onBack: () => void;
}

export function Join({ mode, initialCode = '', game, onBack }: Props) {
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]!);
  const [code, setCode] = useState(initialCode.toUpperCase().slice(0, CODE_LEN));
  const [busy, setBusy] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);

  const joinMode = mode === 'join';
  const canSubmit = name.trim().length > 0 && (!joinMode || code.length === CODE_LEN);

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      await game.join(name.trim(), avatar, joinMode ? code : undefined);
    } catch {
      // error surfaces via the app-level banner
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl animate-moji-pop px-4 py-12">
      <button onClick={onBack} className="mb-4 text-sm text-muted hover:text-paper">
        ← back
      </button>
      <Panel className="space-y-6 p-6 sm:p-8">
        <Eyebrow className="text-cyan">{joinMode ? 'JOIN A PARTY' : 'START A PARTY'}</Eyebrow>
        <h1 className="font-display text-3xl font-extrabold">
          {joinMode ? 'Enter the room code' : 'Create your room'}
        </h1>

        {joinMode && (
          <div>
            <label className="mb-2 block font-mono text-xs uppercase tracking-[2px] text-muted">
              Room code
            </label>
            <div className="relative" onClick={() => codeInput.current?.focus()}>
              <input
                ref={codeInput}
                value={code}
                onChange={(e) =>
                  setCode(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^0-9A-Z]/g, '')
                      .slice(0, CODE_LEN),
                  )
                }
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                inputMode="text"
                autoCapitalize="characters"
                autoFocus
              />
              <div className="flex justify-between gap-2">
                {Array.from({ length: CODE_LEN }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex h-14 flex-1 items-center justify-center rounded-tile border-[2.5px] font-mono text-3xl',
                      code[i] ? 'border-lime text-paper' : 'border-hairline2 text-muted-4',
                    )}
                  >
                    {code[i] ?? '_'}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div>
          <label className="mb-2 block font-mono text-xs uppercase tracking-[2px] text-muted">
            Display name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 20))}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="your name"
            className="w-full rounded-tile border-2 border-hairline2 bg-inset px-4 py-3 text-lg outline-none focus:border-pink"
            autoFocus={!joinMode}
          />
        </div>

        <div>
          <label className="mb-2 block font-mono text-xs uppercase tracking-[2px] text-muted">
            Pick your avatar
          </label>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
            {AVATARS.map((a) => (
              <button
                key={a}
                onClick={() => setAvatar(a)}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-tile border-[2.5px] text-2xl transition-transform hover:scale-105',
                  a === avatar
                    ? 'border-outline bg-pink shadow-sticker-sm'
                    : 'border-hairline2 bg-inset',
                )}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <StickerButton
          variant="lime"
          size="lg"
          className="w-full"
          disabled={!canSubmit || busy}
          onClick={submit}
        >
          {joinMode ? 'Join the Party →' : 'Create the Party 🎉'}
        </StickerButton>
      </Panel>
    </div>
  );
}
