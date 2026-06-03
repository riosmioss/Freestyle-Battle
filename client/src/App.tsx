import Grain from './components/Grain';
import MicBar from './components/MicBar';
import Countdown from './screens/Countdown';
import Home from './screens/Home';
import Lobby from './screens/Lobby';
import Performing from './screens/Performing';
import Rating from './screens/Rating';
import Results from './screens/Results';
import { useGame } from './useGame';
import { useMic } from './useMic';

export default function App() {
  const { connected, room, you, error, publicLobbies, recordings, actions } = useGame();

  // We only need the mic to record your turn — acquired once you're in a room.
  const mic = useMic(!!room);

  let screen: React.ReactNode;
  if (!room) {
    screen = (
      <Home actions={actions} connected={connected} error={error} publicLobbies={publicLobbies} />
    );
  } else {
    switch (room.phase) {
      case 'lobby':
        screen = <Lobby room={room} you={you} actions={actions} mic={mic} />;
        break;
      case 'countdown':
        screen = <Countdown room={room} you={you} />;
        break;
      case 'performing':
        screen = <Performing room={room} you={you} mic={mic} actions={actions} />;
        break;
      case 'rating':
        screen = <Rating room={room} you={you} actions={actions} recordings={recordings} />;
        break;
      case 'results':
        screen = <Results room={room} you={you} actions={actions} recordings={recordings} />;
        break;
      default:
        screen = <Lobby room={room} you={you} actions={actions} mic={mic} />;
    }
  }

  return (
    <div className="app">
      <Grain />
      {!connected && room && <div className="reconnect-banner">Reconnecting to the stage…</div>}
      <div className="app__inner">{screen}</div>
      {room && <MicBar mic={mic} />}
    </div>
  );
}
