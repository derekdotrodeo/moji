import { useState } from 'react';
import type { Player, RoomView } from '@moji/shared';
import type { GameClient } from '../useGame.js';
import { Avatar, Eyebrow, Panel, Segmented, StickerButton, cn } from '../ui.js';

const ROUND_OPTS = [3, 5, 8];
const TIMER_OPTS = [20, 30, 45];

export function LobbyScreen({ game, view }: { game: GameClient; view: RoomView }) {
  const me = view.players.find((p) => p.id === game.myId);
  const isHost = me?.isHost ?? false;
  const players = view.players.filter((p) => p.role === 'player');
  const readyCount = players.filter((p) => p.ready).length;
  const canStart = players.length >= 2;

  const packOptions = [{ slug: '', name: 'Surprise', emoji: '🎲' }, ...view.packs];

  return (
    <div className="mx-auto max-w-5xl animate-moji-pop px-4 py-4 sm:py-6">
      <header className="mb-4">
        <Eyebrow className="text-pink">
          PLAYERS · {readyCount}/{players.length} READY
        </Eyebrow>
        <h1 className="whitespace-nowrap font-display text-3xl font-extrabold sm:text-5xl">
          The Lobby
        </h1>
        <p className="text-sm text-muted">waiting on the squad…</p>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_392px]">
        {/* Players grid */}
        <div className="grid grid-cols-2 gap-3 self-start sm:grid-cols-3">
          {players.map((p) => (
            <PlayerCard key={p.id} player={p} isYou={p.id === game.myId} />
          ))}
        </div>

        {/* Settings sidebar */}
        <Panel className="space-y-4 self-start p-4">
          <RoomCode code={view.code} />

          <div>
            <Eyebrow className="mb-2">Host Settings</Eyebrow>
            <div className="space-y-3">
              <Setting label="Rounds">
                <Segmented
                  options={ROUND_OPTS.map((v) => ({ label: String(v), value: v }))}
                  value={view.config.rounds}
                  disabled={!isHost}
                  onChange={(rounds) => game.configure({ rounds })}
                />
              </Setting>
              <Setting label="Guess timer">
                <Segmented
                  options={TIMER_OPTS.map((v) => ({ label: `${v}s`, value: v }))}
                  value={view.config.guessingSeconds}
                  disabled={!isHost}
                  onChange={(guessingSeconds) => game.configure({ guessingSeconds })}
                />
              </Setting>
              <Setting label="Pack">
                <div className="flex flex-wrap gap-2">
                  {packOptions.map((pack) => (
                    <button
                      key={pack.slug}
                      disabled={!isHost}
                      onClick={() => game.configure({ packSlug: pack.slug })}
                      className={cn(
                        'rounded-pill border-[2.5px] px-3 py-1.5 text-sm transition-all disabled:opacity-50',
                        pack.slug === view.config.packSlug
                          ? 'border-outline bg-cyan text-outline shadow-sticker-sm'
                          : 'border-hairline2 text-muted hover:text-paper',
                      )}
                    >
                      {pack.emoji} {pack.name}
                    </button>
                  ))}
                </div>
              </Setting>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-hairline pt-3">
            <StickerButton
              variant={me?.ready ? 'mint' : 'cyan'}
              className="w-full"
              onClick={() => game.setReady(!me?.ready)}
            >
              {me?.ready ? '✓ Ready!' : "I'm Ready"}
            </StickerButton>
            {isHost && (
              <StickerButton
                variant="pink"
                className="w-full"
                disabled={!canStart}
                onClick={() => game.start()}
              >
                {canStart ? 'Start Game ▶' : 'Need 2+ players'}
              </StickerButton>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function PlayerCard({ player, isYou }: { player: Player; isYou: boolean }) {
  const dim = player.connection === 'DISCONNECTED';
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-card border-[2.5px] p-3 transition-all',
        player.ready ? 'border-mint bg-mint/10' : 'border-hairline2 bg-panel2',
        isYou && 'ring-2 ring-pink ring-offset-2 ring-offset-ink',
        dim && 'opacity-50',
      )}
    >
      <Avatar emoji={player.avatar} id={player.id} className="h-12 w-12 text-2xl" />
      <div className="min-w-0">
        <div className="flex items-center gap-1 font-display font-extrabold">
          <span className="truncate">{player.displayName}</span>
          {player.isHost && <span title="host">👑</span>}
        </div>
        <div
          className={cn('font-mono text-xs', player.ready ? 'text-mint' : 'text-muted')}
        >
          {dim ? 'reconnecting…' : player.ready ? 'ready' : 'getting ready…'}
        </div>
      </div>
    </div>
  );
}

function RoomCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/r/${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked; ignore */
    }
  };
  return (
    <div className="flex items-center justify-between rounded-tile border border-hairline2 bg-inset px-4 py-3">
      <div>
        <div className="font-mono text-xs uppercase tracking-[2px] text-muted">Room code</div>
        <div className="font-mono text-3xl font-bold tracking-widest text-lime">{code}</div>
      </div>
      <button onClick={copy} className="text-sm text-cyan hover:text-cyan-light">
        {copied ? 'Copied!' : 'Copy link'}
      </button>
    </div>
  );
}

function Setting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted">{label}</span>
      {children}
    </div>
  );
}
