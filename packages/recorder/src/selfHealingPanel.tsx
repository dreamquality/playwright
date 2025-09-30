/*
  Copyright (c) Microsoft Corporation.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

import * as React from 'react';
import { ToolbarButton } from '@web/components/toolbarButton';
import './selfHealingPanel.css';

export interface HealingCandidate {
  locator: string;
  score: number;
  reasoning: string;
  strategy: string;
  elementId?: string;
}

export interface HealingFailureContext {
  testName?: string;
  lineNumber?: number;
  screenshot?: string;
  timestamp: number;
}

export interface SelfHealingPanelProps {
  originalLocator: string;
  failureContext: HealingFailureContext;
  candidates: HealingCandidate[];
  onHighlight: (locator: string) => void;
  onApprove: (candidate: HealingCandidate) => void;
  onRejectAll: () => void;
  onEditManually: () => void;
}

export const SelfHealingPanel: React.FC<SelfHealingPanelProps> = ({
  originalLocator,
  failureContext,
  candidates,
  onHighlight,
  onApprove,
  onRejectAll,
  onEditManually,
}) => {
  const [selectedCandidate, setSelectedCandidate] = React.useState<HealingCandidate | null>(null);

  const getScoreColor = (score: number): string => {
    if (score >= 90) return 'var(--vscode-testing-iconPassed)';
    if (score >= 70) return 'var(--vscode-testing-iconQueued)';
    return 'var(--vscode-testing-iconFailed)';
  };

  const getScoreIcon = (score: number): string => {
    if (score >= 90) return 'check';
    if (score >= 70) return 'circle-outline';
    return 'warning';
  };

  if (candidates.length === 0) {
    return (
      <div className="self-healing-panel">
        <div className="failure-header">
          <div className="failure-icon">❌</div>
          <div className="failure-title">Locator Failed</div>
        </div>
        
        <div className="original-locator">
          <div className="label">Original:</div>
          <code className="locator-code">{originalLocator}</code>
        </div>

        {failureContext.testName && (
          <div className="context-info">
            <div className="test-name">Test: {failureContext.testName}</div>
            {failureContext.lineNumber && (
              <div className="line-number">Line: {failureContext.lineNumber}</div>
            )}
          </div>
        )}

        <div className="no-candidates">
          <div className="no-candidates-icon">🔍</div>
          <div className="no-candidates-title">No healing candidates found</div>
          <div className="no-candidates-subtitle">
            The self-healing system could not find any suitable alternatives for this locator.
          </div>
        </div>

        <div className="actions">
          <ToolbarButton 
            icon="edit" 
            title="Edit Manually" 
            onClick={onEditManually}
          >
            Edit Manually
          </ToolbarButton>
        </div>
      </div>
    );
  }

  return (
    <div className="self-healing-panel">
      <div className="failure-header">
        <div className="failure-icon">❌</div>
        <div className="failure-title">Locator Failed</div>
      </div>
      
      <div className="original-locator">
        <div className="label">Original:</div>
        <code className="locator-code">{originalLocator}</code>
      </div>

      {failureContext.testName && (
        <div className="context-info">
          <div className="test-name">Test: {failureContext.testName}</div>
          {failureContext.lineNumber && (
            <div className="line-number">Line: {failureContext.lineNumber}</div>
          )}
        </div>
      )}

      <div className="candidates-section">
        <div className="candidates-header">
          <div className="candidates-icon">🔍</div>
          <div className="candidates-title">Found {candidates.length} candidate{candidates.length !== 1 ? 's' : ''}:</div>
        </div>

        <div className="candidates-list">
          {candidates.map((candidate, index) => (
            <div 
              key={index} 
              className={`candidate ${selectedCandidate === candidate ? 'selected' : ''}`}
              onClick={() => setSelectedCandidate(candidate)}
            >
              <div className="candidate-header">
                <div className="candidate-icon" style={{ color: getScoreColor(candidate.score) }}>
                  <span className={`codicon codicon-${getScoreIcon(candidate.score)}`}></span>
                </div>
                <code className="candidate-locator">{candidate.locator}</code>
                <div className="candidate-score" style={{ color: getScoreColor(candidate.score) }}>
                  ({candidate.score})
                </div>
              </div>
              
              <div className="candidate-details">
                <div className="candidate-strategy">Strategy: {candidate.strategy}</div>
                <div className="candidate-reasoning">{candidate.reasoning}</div>
              </div>

              <div className="candidate-actions">
                <ToolbarButton 
                  icon="eye" 
                  title="Highlight element on page" 
                  onClick={(e) => {
                    e.stopPropagation();
                    onHighlight(candidate.locator);
                  }}
                >
                  Highlight
                </ToolbarButton>
                <ToolbarButton 
                  icon="check" 
                  title="Use this locator" 
                  onClick={(e) => {
                    e.stopPropagation();
                    onApprove(candidate);
                  }}
                >
                  Approve
                </ToolbarButton>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel-actions">
        <ToolbarButton 
          icon="close" 
          title="Reject all suggestions" 
          onClick={onRejectAll}
        >
          Reject All
        </ToolbarButton>
        <ToolbarButton 
          icon="edit" 
          title="Edit locator manually" 
          onClick={onEditManually}
        >
          Edit Manually
        </ToolbarButton>
      </div>
    </div>
  );
};