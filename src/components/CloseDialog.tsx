import { useTranslation } from 'react-i18next';
import { useProjectStore } from '../store/useProjectStore';
import { saveProjectJSON } from '../utils/projectFile';

interface Props {
  onCancel: () => void;
}

export default function CloseDialog({ onCancel }: Props) {
  const { t } = useTranslation();
  const project   = useProjectStore((s) => s.project);
  const markSaved = useProjectStore((s) => s.markSaved);

  const doClose = () => window.electronAPI?.confirmClose();

  const handleSaveAndExit = () => {
    if (project) {
      saveProjectJSON(project);
      markSaved();
    }
    doClose();
  };

  return (
    <div style={S.backdrop}>
      <div style={S.dialog}>
        <div style={S.title}>{t('closeDialog.title')}</div>
        <div style={S.message}>
          {t('closeDialog.message', { name: project?.name ?? 'this project' }).split('<strong>').map((part, i) =>
            i === 0 ? part : <>
              <strong style={{ color: 'var(--text-primary)' }}>{part.split('</strong>')[0]}</strong>
              {part.split('</strong>')[1]}
            </>
          )}
        </div>
        <div style={S.buttons}>
          <button className="btn-primary" style={S.btn} onClick={handleSaveAndExit}>
            {t('closeDialog.saveAndExit')}
          </button>
          <button className="btn-secondary" style={S.btn} onClick={doClose}>
            {t('closeDialog.exitWithout')}
          </button>
          <button className="btn-icon" style={{ ...S.btn, marginLeft: 'auto' }} onClick={onCancel}>
            {t('closeDialog.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialog: {
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg, 10px)',
    boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
    padding: '28px 32px',
    width: 400,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text-primary)',
  },
  message: {
    fontSize: 13,
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  },
  buttons: {
    display: 'flex',
    gap: 8,
    marginTop: 4,
  },
  btn: {
    fontSize: 12,
    padding: '7px 14px',
  },
};
