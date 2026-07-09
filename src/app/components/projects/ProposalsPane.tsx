import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useUser } from '@clerk/clerk-react';
import { toast } from 'sonner';
import { Plus, X, FileText, ChevronRight } from 'lucide-react';
import { useData } from '../../context/DataContext';

// Proposals for a mountain — one per project. Create/open the ProposalBuilder
// per proposal.
export function ProposalsPane({ mountainId }: { mountainId: string }) {
  const { getProposalsByMountainId, getProjectsByMountainId, getProjectById, addProposal } = useData();
  const navigate = useNavigate();
  const { user } = useUser();
  const createdBy = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'You';

  const proposals = getProposalsByMountainId(mountainId);
  const projects = getProjectsByMountainId(mountainId);
  const projectsWithoutProposal = projects.filter(p => !proposals.some(pr => pr.projectId === p.id));
  const [showNew, setShowNew] = useState(false);

  const create = (projectId?: string) => {
    const proj = projectId ? getProjectById(projectId) : undefined;
    const id = addProposal({ mountainId, projectId, title: proj ? `${proj.name} proposal` : 'Proposal', createdBy });
    setShowNew(false);
    navigate(`/mountains/${mountainId}/proposal/${id}`);
  };

  return (
    <div className="bg-white rounded-[12px] border border-[rgba(0,0,0,0.1)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[#0a0a0a] font-['Inter:Medium',sans-serif] font-medium text-[16px]">
          Proposals{proposals.length > 0 && <span className="ml-2 text-[#6a7282] text-[13px] font-normal">({proposals.length})</span>}
        </h2>
        <button onClick={() => setShowNew(true)} className="bg-[#ff5c39] text-white rounded-[8px] px-2.5 py-1.5 flex items-center gap-1 font-['Inter:Medium',sans-serif] font-medium text-[13px] active:opacity-80">
          <Plus size={14} /> New
        </button>
      </div>

      {proposals.length === 0 ? (
        <div className="text-[13px] text-[#6a7282]">No proposals yet. <button onClick={() => setShowNew(true)} className="text-[#307fe2]">Create one</button></div>
      ) : (
        <div className="space-y-2">
          {proposals.map(pr => {
            const proj = pr.projectId ? getProjectById(pr.projectId) : undefined;
            return (
              <button key={pr.id} onClick={() => navigate(`/mountains/${mountainId}/proposal/${pr.id}`)}
                className="w-full text-left border border-[rgba(0,0,0,0.08)] rounded-[10px] p-2.5 active:bg-[#f9fafb] hover:border-[rgba(0,0,0,0.14)] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={15} className="text-[#ff5c39] shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[14px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] truncate">{pr.form?.proposalNumber || pr.title || 'Proposal'}</div>
                    <div className="text-[11px] text-[#6a7282]">{proj ? proj.name : 'No project'}{pr.form?.date ? ` · ${pr.form.date}` : ''}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${pr.proposalCreated ? 'bg-[#eaf5ef] text-[#3f7a5c]' : 'bg-[#f3f3f5] text-[#6a7282]'}`}>{pr.proposalCreated ? 'Sent' : 'Draft'}</span>
                  <ChevronRight size={14} className="text-[#c0c4cc]" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setShowNew(false); }}>
          <div className="bg-white rounded-[16px] w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-[16px] font-['Inter:Medium',sans-serif] text-[#0a0a0a]">New proposal</h3>
              <button onClick={() => setShowNew(false)} className="p-1.5 rounded-full bg-[#f3f3f5]"><X size={16} className="text-[#6a7282]" /></button>
            </div>
            <p className="text-[13px] text-[#6a7282]">Pick the project this proposal is for (one proposal per project).</p>
            {projectsWithoutProposal.length === 0 && projects.length > 0 ? (
              <p className="text-[13px] text-[#8992a0]">Every project already has a proposal.</p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {projectsWithoutProposal.map(p => (
                  <button key={p.id} onClick={() => create(p.id)} className="w-full text-left px-3 py-2.5 rounded-[8px] bg-[#f9fafb] border border-[rgba(0,0,0,0.06)] active:bg-[#f3f3f5]">
                    <span className="text-[14px] text-[#0a0a0a]">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => create(undefined)} className="w-full text-[13px] text-[#307fe2] py-1 active:opacity-70">Or create without a project</button>
          </div>
        </div>
      )}
    </div>
  );
}
