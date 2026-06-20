import { useEffect, useState } from 'react';
import { useGame } from './useGame.js';
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

  // Deep link: /r/<CODE> jumps to Join with the code pre-filled.
  useEffect(() => {
    const m = window.location.pathname.match(/^\/r\/([0-9A-Za-z]+)/);
    if (m) {
      setPrefillCode(m[1]!.toUpperCase());
      setRoute('join');
    }
  }, []);

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
        return <Winner game={game} view={view} />;
      default:
        return <SplashScreen view={view} />;
    }
  }
}
