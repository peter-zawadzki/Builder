import { MountainNote, NoteTopic } from '../context/DataContext';

interface SalesProcessBarProps {
  notes: MountainNote[];
  onStageClick?: (topic: NoteTopic) => void;
}

export function SalesProcessBar({ notes, onStageClick }: SalesProcessBarProps) {
  // Helper to find note by topic
  const getNoteByTopic = (topic: NoteTopic) => notes.find(n => n.topic === topic);

  type StageConfig = {
    label: string;
    topic: NoteTopic;
    isCompleted: boolean;
    isScheduled: boolean;
    isOverdue: boolean;
    installProgress?: number;
  };

  const calculateDaysOld = (updatedAt: string): number => {
    const updated = new Date(updatedAt);
    const now = new Date();
    return Math.floor((now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24));
  };

  const formatLastUpdated = (updatedAt?: string): string => {
    if (!updatedAt) return 'Never updated';
    const date = new Date(updatedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    // Format the date
    const dateStr = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Show relative time for recent updates
    if (diffMinutes < 60) {
      return `Last updated ${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago (${dateStr} at ${timeStr})`;
    } else if (diffHours < 24) {
      return `Last updated ${diffHours} hour${diffHours !== 1 ? 's' : ''} ago (${dateStr} at ${timeStr})`;
    } else if (diffDays === 1) {
      return `Last updated yesterday (${dateStr} at ${timeStr})`;
    } else if (diffDays < 7) {
      return `Last updated ${diffDays} days ago (${dateStr} at ${timeStr})`;
    } else {
      return `Last updated ${dateStr} at ${timeStr}`;
    }
  };

  const stages: StageConfig[] = [
    {
      label: 'Demo',
      topic: 'Demo',
      isCompleted: !!getNoteByTopic('Demo')?.completed,
      isScheduled: !!getNoteByTopic('Demo')?.scheduled,
      isOverdue: (() => {
        const note = getNoteByTopic('Demo');
        return !!(note?.scheduled && !note?.completed && calculateDaysOld(note.updatedAt) > 20);
      })(),
    },
    {
      label: 'Visit',
      topic: 'Site Visit',
      isCompleted: !!getNoteByTopic('Site Visit')?.completed,
      isScheduled: !!getNoteByTopic('Site Visit')?.scheduled,
      isOverdue: (() => {
        const note = getNoteByTopic('Site Visit');
        return !!(note?.scheduled && !note?.completed && calculateDaysOld(note.updatedAt) > 20);
      })(),
    },
    {
      label: 'Proposal',
      topic: 'Proposal',
      isCompleted: !!getNoteByTopic('Proposal')?.completed,
      isScheduled: !!getNoteByTopic('Proposal')?.scheduled,
      isOverdue: (() => {
        const note = getNoteByTopic('Proposal');
        return !!(note?.scheduled && !note?.completed && calculateDaysOld(note.updatedAt) > 20);
      })(),
    },
    {
      label: 'Install',
      topic: 'Install',
      installProgress: getNoteByTopic('Install')?.installProgress,
      isCompleted: getNoteByTopic('Install')?.installProgress === 100,
      isScheduled: getNoteByTopic('Install')?.installProgress !== undefined && getNoteByTopic('Install')?.installProgress !== 100,
      isOverdue: (() => {
        const note = getNoteByTopic('Install');
        const progress = note?.installProgress;
        return !!(progress !== undefined && progress !== 100 && calculateDaysOld(note.updatedAt) > 20);
      })(),
    },
    {
      label: 'Training',
      topic: 'Training',
      isCompleted: !!getNoteByTopic('Training')?.completed,
      isScheduled: !!getNoteByTopic('Training')?.scheduled,
      isOverdue: (() => {
        const note = getNoteByTopic('Training');
        return !!(note?.scheduled && !note?.completed && calculateDaysOld(note.updatedAt) > 20);
      })(),
    },
  ];

  return (
    <div className="mt-2.5 pt-2.5 border-t border-[rgba(0,0,0,0.06)]">
      {/* Chevron progress bar */}
      <div className="flex items-center overflow-hidden">
        {stages.map((stage, idx) => {
          // Handle Install stage with progress
          const hasInstallProgress = stage.topic === 'Install' && stage.installProgress !== undefined;
          const progress = stage.installProgress ?? 0;

          let background: string;
          let textColor: string;

          if (hasInstallProgress) {
            // Install stage with progress tracking
            if (progress === 0) {
              // Scheduled - entire bar yellow (or red if overdue)
              background = stage.isOverdue ? '#ef4444' : '#fbbf24';
              textColor = '#ffffff';
            } else if (progress === 100) {
              // Completed - entire bar green
              background = '#22c55e';
              textColor = '#ffffff';
            } else {
              // Partial progress - green fill with gray remainder (or red if overdue)
              const fillColor = stage.isOverdue ? '#ef4444' : '#22c55e';
              background = `linear-gradient(to right, ${fillColor} ${progress}%, #e5e7eb ${progress}%)`;
              textColor = '#ffffff';
            }
          } else {
            // Other stages - standard coloring
            const bgColor = stage.isCompleted
              ? '#22c55e'
              : stage.isOverdue
              ? '#ef4444'
              : stage.isScheduled
              ? '#fbbf24'
              : '#e5e7eb';
            background = bgColor;
            textColor = (stage.isCompleted || stage.isScheduled || stage.isOverdue) ? '#ffffff' : '#9ca3af';
          }

          const stageNote = getNoteByTopic(stage.topic);
          const tooltipText = formatLastUpdated(stageNote?.updatedAt);

          return (
            <button
              key={idx}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onStageClick) onStageClick(stage.topic);
              }}
              className="relative flex-1 min-w-0 active:opacity-70"
              style={{ marginLeft: idx === 0 ? '0' : '-6px' }}
              title={tooltipText}
            >
              <div
                className="relative h-6 flex items-center justify-center"
                style={{
                  background,
                  clipPath: idx === 0
                    ? 'polygon(0 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 0 100%)'
                    : idx === stages.length - 1
                    ? 'polygon(6px 0, 100% 0, 100% 100%, 6px 100%, 0 50%)'
                    : 'polygon(6px 0, calc(100% - 6px) 0, 100% 50%, calc(100% - 6px) 100%, 6px 100%, 0 50%)',
                }}
              >
                <span
                  className="text-[9px] font-['Inter:Medium',sans-serif] font-medium px-1 truncate relative z-10"
                  style={{ color: textColor }}
                >
                  {stage.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
