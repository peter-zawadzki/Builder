import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { listSiteAssessments, createSiteAssessment, type SiteAssessment } from '../utils/siteAssessmentsApi';

// "Add Location" from a Trail now opens the Site Assessment map view (device
// toolbar) instead of the old CreateLocation.tsx form — that flow is
// obsolete now that every device dropped on the map is a real Location.
// A mountain can have more than one Site Assessment, so this resolves which
// one a newly-added item should belong to: skip straight there if there's
// exactly one (or none yet, in which case one is created on the fly), or
// ask via ChooseSiteAssessmentModal if there's more than one.
//
// Also fetches the mountain's assessments on mount (not just on click) so a
// Trail page can show "Add Assessment" vs "View Assessment" before the user
// has clicked anything.
export function useAddLocationToMap(mountainId: string, mountainName: string) {
  const navigate = useNavigate();
  const [picking, setPicking] = useState<SiteAssessment[] | null>(null);
  const [pendingTrailId, setPendingTrailId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [assessments, setAssessments] = useState<SiteAssessment[] | null>(null);
  const [assessmentsLoading, setAssessmentsLoading] = useState(true);

  const fetchAssessments = useCallback(async () => {
    try {
      const all = await listSiteAssessments();
      const mine = all.filter(a => a.mountain_id === mountainId && !a.archived_at);
      setAssessments(mine);
      return mine;
    } catch (err: any) {
      console.error('[useAddLocationToMap] fetchAssessments error:', err);
      return null;
    } finally {
      setAssessmentsLoading(false);
    }
  }, [mountainId]);

  useEffect(() => {
    setAssessmentsLoading(true);
    fetchAssessments();
  }, [fetchAssessments]);

  function goTo(assessmentId: string, trailId?: string) {
    navigate(`/mountains/${mountainId}/site-assessments/${assessmentId}${trailId ? `?trailId=${trailId}` : ''}`);
  }

  async function start(trailId?: string) {
    setLoading(true);
    try {
      const mine = assessments ?? (await fetchAssessments()) ?? [];
      if (mine.length === 0) {
        const created = await createSiteAssessment({ name: `${mountainName} Site Assessment`, mountain_id: mountainId });
        setAssessments(prev => [...(prev ?? []), created]);
        goTo(created.id, trailId);
      } else if (mine.length === 1) {
        goTo(mine[0].id, trailId);
      } else {
        setPendingTrailId(trailId);
        setPicking(mine);
      }
    } catch (err: any) {
      toast.error(`Couldn't open Site Assessment: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  function choose(assessmentId: string) {
    setPicking(null);
    goTo(assessmentId, pendingTrailId);
  }

  return {
    start, loading, picking, choose, cancelPicking: () => setPicking(null),
    hasAssessment: (assessments?.length ?? 0) > 0, assessmentsLoading,
  };
}
