import { useEffect, useRef, useState } from 'react';
import { useGame } from './useGame.js';
import { getStoredAvatar, getStoredName, tokenRoomCode } from './session.js';
import { Landing } from './screens/Landing.js';
import { Join } from './screens/Join.js';
import { LobbyScreen } from './screens/Lobby.js';
import { RoundIntro, PromptAssignment } from './screens/Prompt.js';
import { ClueScreen } from './screens/Create.js';
import { GuessScreen } from './screens/Guess.js';
import { RevealScreen } from './screens/Reveal.js';
import { Leaderboard } from './screens/Leaderboard.js';
import { Winner } from './screens/Winner.js';
import { SplashScreen } from './screens.js';

type PreGameRoute = 'landing' | 'create' | 'join';

export default function App() {
  const game = useGame();
  const { view, error, clearError, connected } = game;
  const [route, setRoute] = useState<PreGameRoute>('landing');
  const [prefillCode, setPrefillCode] = useState('');
  // Capture the URL on first render, before the URL-sync effect can change it.
  const initialCode = useRef(window.location.pathname.match(/^\/r\/([0-9A-Za-z]+)/)?.[1]?.toUpperCase());

  // On load with /r/<CODE>: silently rejoin if it's the room our token is for
  // (e.g. an accidental refresh), otherwise open Join with the code pre-filled.
  useEffect(() => {
    const code = initialCode.current;
    if (!code) return;
    if (tokenRoomCode() === code) {
      void game.join(getStoredName() || 'Player', getStoredAvatar(), code).catch(() => {
        setPrefillCode(code);
        setRoute('join');
      });
    } else {
      setPrefillCode(code);
      setRoute('join');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the browser URL in sync: /r/<CODE> while in a room, / on the landing.
  useEffect(() => {
    const path = view?.code ? `/r/${view.code}` : route === 'landing' ? '/' : null;
    if (path && window.location.pathname !== path) {
      window.history.replaceState(null, '', path);
    }
  }, [view?.code, route]);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(clearError, 4000);
    return () => clearTimeout(id);
  }, [error, clearError]);

  return (
    <div className="min-h-screen">
      {!connected && (
        <div className="fixed inset-x-0 top-0 z-20 bg-orange py-1 text-center font-mono text-xs uppercase tracking-[2px] text-outline">
          Reconnecting…
        </div>
      )}
      {error && (
        <div className="fixed inset-x-0 top-0 z-20 bg-coral py-2 text-center text-sm font-semibold text-outline">
          {error}
        </div>
      )}
      {render()}
    </div>
  );

  function render() {
    if (!view || view.phase === 'ROOM_CLOSED') {
      if (route === 'landing') {
        return <Landing onCreate={() => setRoute('create')} onJoin={() => setRoute('join')} />;
      }
      return (
        <Join
          mode={route === 'create' ? 'create' : 'join'}
          initialCode={prefillCode}
          game={game}
          onBack={() => setRoute('landing')}
        />
      );
    }

    switch (view.phase) {
      case 'LOBBY':
        return <LobbyScreen game={game} view={view} />;
      case 'ROUND_INTRO':
        return <RoundIntro view={view} />;
      case 'PROMPT_ASSIGNMENT':
        return <PromptAssignment view={view} />;
      case 'CLUE_CREATION':
        return <ClueScreen game={game} view={view} />;
      case 'CLUE_REVEAL':
      case 'GUESSING':
        return <GuessScreen game={game} view={view} />;
      case 'CLUE_SCORING':
        return <RevealScreen view={view} />;
      case 'ROUND_RESULTS':
        return <Leaderboard game={game} view={view} />;
      case 'GAME_RESULTS':
        return (
          <Winner
            game={game}
            view={view}
            onLeave={() => {
              void game.leave();
              setRoute('landing');
            }}
          />
        );
      default:
        return <SplashScreen view={view} />;
    }
  }
}
