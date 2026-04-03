import TopToolbar from '../components/TopToolbar';
import WallTabBar from '../components/WallTabBar';
import CanvasBottomBar from '../components/CanvasBottomBar';
import LeftSidebar from '../components/LeftSidebar';
import RightSidebar from '../components/RightSidebar';
import WallCanvas from '../components/WallCanvas';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

export default function WallBuilder() {
  useKeyboardShortcuts();

  return (
    <div style={styles.root}>
      <TopToolbar />
      <WallTabBar />
      <div style={styles.body}>
        <LeftSidebar />
        <WallCanvas />
        <RightSidebar />
      </div>
      <CanvasBottomBar />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-base)',
    overflow: 'hidden',
  },
  body: {
    flex: 1,
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden',
    minHeight: 0,
  },
};
