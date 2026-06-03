import { useMemo } from 'react';
import Grain from './components/Grain';
import VoiceBar from './components/VoiceBar';
import Battle from './screens/Battle';
import Countdown from './screens/Countdown';
import Home from './screens/Home';
import Lobby from './screens/Lobby';
import Rating from './screens/Rating';
import Results from './screens/Results';
import { useGame } from './useGame';
import { useVoice } from './useVoice';

export default function App() {
  const { connected, room, you, error, publicLobbies, actions } = useGame();

  // Voice lives at the app level so the mic + peer mesh persist across phases.
  const players = useMemo(() => room?.players ?? [], [room]);
  const voice = useVoice(!!room, players, you);

  let screen: React.ReactNode;
  if (!room) {
    screen = (
      <Home actions={actions} connected={connected} error={error} publicLobbies={publicLobbies} />
    );
  } else {
    switch (room.phase) {
      case 'lobby':
        screen = <Lobby room={room} you={you} actions={actions} levels={voice.levels} />;
        break;
      case 'countdown':
        screen = <Countdown room={room} />;
        break;
      case 'battle':
        screen = <Battle room={room} you={you} levels={voice.levels} />;
        break;
      case 'rating':
        screen = <Rating room={room} you={you} actions={actions} />;
        break;
      case 'results':
        screen = <Results room={room} you={you} actions={actions} />;
        break;
      default:
        screen = <Lobby room={room} you={you} actions={actions} levels={voice.levels} />;
    }
  }

  return (
    <div className="app">
      <Grain />
      {!connected && room && <div className="reconnect-banner">Reconnecting to the stage…</div>}
      <div className="app__inner">{screen}</div>
      {room && <VoiceBar voice={voice} />}
    </div>
  );
}
