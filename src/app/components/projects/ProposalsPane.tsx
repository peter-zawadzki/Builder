import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useUser } from '@clerk/clerk-react';
import { toast } from 'sonner';
import { Plus, X, FileText, ChevronRight, Archive } from 'lucide-react';
import { useData } from '../../context/DataContext';

// Proposals for a mountain — one active proposal per project. Create/open
// the ProposalBuilder per proposal. Proposals are never hard-deleted —
// archiving keeps the historical record (including signatures) while
// freeing the project up for a brand-new proposal.
export function ProposalsPane({ mountainId }: { mountainId: string }) {
  const { getProposalsByMountainId, getProjectsByMountainId, getProjectById, addProposal, getCustomerAgreementByMountainId } = useData();
  const navigate = useNavigate();
  const { user } = useUser();
  const createdBy = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'You';

  const allProposals = getProposalsByMountainId(mountainId);
  const proposals = allProposals.filter(pr => !pr.archived);
  const archivedProposals = allProposals.filter(pr => pr.archived);
  const projects = getProjectsByMountainId(mountainId);
  const projectsWithoutProposal = projects.filter(p => !proposals.some(pr => pr.projectId === p.id));
  const [showNew, setShowNew] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // User Agreement pill (Dev Story 13.1) — only relevant, and only shown,
  // once a proposal on this mountain is fully executed. Colors mirror the
  // Proposal/Contract pill lifecycle from 12.1/12.2.
  const anyProposalSigned = proposals.some(pr => !!pr.clientSignature && !!pr.yullrSignature);
  const agreement = anyProposalSigned ? getCustomerAgreementByMountainId(mountainId) : undefined;
  const agreementSigned = !!(agreement?.clientSignature && agreement?.yullrSignature);

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
        <div className="text-[13px] text-[#6a7282]">No proposals yet.</div>
      ) : (
        <div className="space-y-2">
          {proposals.map(pr => {
            const proj = pr.projectId ? getProjectById(pr.projectId) : undefined;
            const bothSigned = !!pr.clientSignature && !!pr.yullrSignature;
            // Lifecycle per Dev Story 12.1: Created (draft, not yet sent) ->
            // grey; Sent to customer -> orange; Signed and countersigned
            // (fully executed) -> green. "Created" (finalized-but-unsent)
            // stays grey alongside "Draft" — the pill only turns orange once
            // it's actually gone out to the customer.
            const status = bothSigned
              ? { label: 'Signed', color: 'bg-[#eaf5ef] text-[#3f7a5c]', icon: 'text-[#3f7a5c]' }
              : pr.sentAt
              ? { label: `Sent ${new Date(pr.sentAt).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}`, color: 'bg-[#fff3e0] text-[#e65100]', icon: 'text-[#e65100]' }
              : pr.proposalCreated
              ? { label: 'Created', color: 'bg-[#f3f3f5] text-[#6a7282]', icon: 'text-[#6a7282]' }
              : { label: 'Draft', color: 'bg-[#f3f3f5] text-[#6a7282]', icon: 'text-[#ff5c39]' };
            return (
              <button key={pr.id} onClick={() => navigate(`/mountains/${mountainId}/proposal/${pr.id}`)}
                className="w-full text-left border border-[rgba(0,0,0,0.08)] rounded-[10px] p-2.5 active:bg-[#f9fafb] hover:border-[rgba(0,0,0,0.14)] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={15} className={`shrink-0 ${status.icon}`} />
                  <div className="min-w-0">
                    <div className="text-[14px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] truncate">{pr.form?.proposalNumber || pr.title || 'Proposal'}</div>
                    <div className="text-[11px] text-[#6a7282]">{proj ? proj.name : 'No project'}{pr.form?.date ? ` · ${pr.form.date}` : ''}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${status.color}`}>{status.label}</span>
                  {bothSigned && (
                    <span
                      onClick={e => { e.stopPropagation(); navigate(`/mountains/${mountainId}/agreement`); }}
                      title="User Agreement status"
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        agreementSigned ? 'bg-[#eaf5ef] text-[#3f7a5c]' : agreement ? 'bg-[#fffbeb] text-[#b45309]' : 'bg-[#f3f3f5] text-[#6a7282]'
                      }`}
                    >
                      Agreement: {agreementSigned ? 'Signed' : agreement ? 'Sent' : 'Not started'}
                    </span>
                  )}
                  <ChevronRight size={14} className="text-[#c0c4cc]" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {archivedProposals.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[rgba(0,0,0,0.06)]">
          <button
            onClick={() => setShowArchived(v => !v)}
            className="text-[12px] text-[#8992a0] font-['Inter:Medium',sans-serif] flex items-center gap-1 active:opacity-70"
          >
            <Archive size={12} />
            {showArchived ? 'Hide archived' : `Archived (${archivedProposals.length})`}
          </button>
          {showArchived && (
            <div className="space-y-2 mt-2">
              {archivedProposals.map(pr => {
                const proj = pr.projectId ? getProjectById(pr.projectId) : undefined;
                return (
                  <button key={pr.id} onClick={() => navigate(`/mountains/${mountainId}/proposal/${pr.id}`)}
                    className="w-full text-left border border-[rgba(0,0,0,0.08)] rounded-[10px] p-2.5 active:bg-[#f9fafb] flex items-center justify-between gap-2 opacity-60">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={15} className="text-[#8992a0] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[14px] font-['Inter:Medium',sans-serif] text-[#0a0a0a] truncate">{pr.form?.proposalNumber || pr.title || 'Proposal'}</div>
                        <div className="text-[11px] text-[#6a7282]">{proj ? proj.name : 'No project'}</div>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-[#c0c4cc]" />
                  </button>
                );
              })}
            </div>
          )}
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
