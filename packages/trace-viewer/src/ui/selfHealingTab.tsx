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
import type * as modelUtil from './modelUtil';
import './selfHealingTab.css';

export interface HealingTraceEvent {
  type: 'locator-healed';
  originalLocator: string;
  healedLocator: string;
  score: number;
  strategy: string;
  applied: boolean;
  autoApplied?: boolean;
  testName?: string;
  lineNumber?: number;
  timestamp: number;
  actionId?: string;
}

export interface SelfHealingTabProps {
  model: modelUtil.MultiTraceModel | undefined;
}

interface HealingStats {
  autoApplied: number;
  requiresReview: number;
  failed: number;
  total: number;
}

type SelfHealingTabModel = {
  healingEvents: HealingTraceEvent[];
};

export function useSelfHealingTabModel(model: modelUtil.MultiTraceModel | undefined): SelfHealingTabModel {
  return React.useMemo(() => {
    if (!model) {
      return { healingEvents: [] };
    }
    
    // Extract real healing events from the trace model
    const realHealingEvents: HealingTraceEvent[] = [];
    
    // Look for healing events in the model's events
    // In a real implementation, these would be recorded during test execution
    if (model.pages) {
      for (const page of model.pages) {
        // Check if the page has recorded self-healing events
        const pageEvents = (page as any)._selfHealingEvents || [];
        for (const event of pageEvents) {
          if (event.type === 'locator-healed') {
            realHealingEvents.push({
              type: 'locator-healed',
              originalLocator: event.originalLocator,
              healedLocator: event.healedLocator,
              score: event.score,
              strategy: event.strategy,
              applied: event.applied,
              autoApplied: event.autoApplied,
              testName: event.testName,
              lineNumber: event.lineNumber,
              timestamp: event.timestamp,
              actionId: event.actionId
            });
          }
        }
      }
    }
    
    // If no real events were found, return empty array (not mock data)
    if (realHealingEvents.length === 0) {
      return { healingEvents: [] };
    }
    
    return { healingEvents: realHealingEvents };
  }, [model]);
}

export const SelfHealingTab: React.FC<SelfHealingTabProps> = ({ model }) => {
  const { healingEvents } = useSelfHealingTabModel(model);

  const stats = React.useMemo((): HealingStats => {
    return {
      autoApplied: healingEvents.filter(e => e.autoApplied).length,
      requiresReview: healingEvents.filter(e => e.score >= 70 && e.score < 90 && !e.applied).length,
      failed: healingEvents.filter(e => e.score < 70).length,
      total: healingEvents.length
    };
  }, [healingEvents]);

  const getScoreColor = (score: number): string => {
    if (score >= 90) return 'var(--vscode-testing-iconPassed)';
    if (score >= 70) return 'var(--vscode-testing-iconQueued)';
    return 'var(--vscode-testing-iconFailed)';
  };

  const getStatusIcon = (event: HealingTraceEvent): string => {
    if (event.applied && event.autoApplied) return '✅';
    if (event.applied && !event.autoApplied) return '👤';
    if (!event.applied && event.score >= 70) return '⚠️';
    return '❌';
  };

  const getStatusText = (event: HealingTraceEvent): string => {
    if (event.applied && event.autoApplied) return 'Auto-Applied';
    if (event.applied && !event.autoApplied) return 'Manually Applied';
    if (!event.applied && event.score >= 70) return 'Requires Review';
    return 'Failed to Heal';
  };

  if (healingEvents.length === 0) {
    return (
      <div className="self-healing-tab">
        <div className="no-healing-events">
          <div className="no-events-icon">🔧</div>
          <div className="no-events-title">No Self-Healing Events</div>
          <div className="no-events-subtitle">
            This trace does not contain any self-healing suggestions or applied fixes.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="self-healing-tab">
      <div className="healing-summary">
        <div className="summary-header">
          <h3>Self-Healing Summary</h3>
        </div>
        
        <div className="stats-grid">
          <div className="stat-card success">
            <div className="stat-number">{stats.autoApplied}</div>
            <div className="stat-label">Auto-Applied</div>
            <div className="stat-description">High confidence fixes (≥90%)</div>
          </div>
          
          <div className="stat-card warning">
            <div className="stat-number">{stats.requiresReview}</div>
            <div className="stat-label">Requires Review</div>
            <div className="stat-description">Medium confidence (70-89%)</div>
          </div>
          
          <div className="stat-card error">
            <div className="stat-number">{stats.failed}</div>
            <div className="stat-label">Failed to Heal</div>
            <div className="stat-description">Low confidence (&lt;70%)</div>
          </div>
          
          <div className="stat-card total">
            <div className="stat-number">{stats.total}</div>
            <div className="stat-label">Total Events</div>
            <div className="stat-description">All healing attempts</div>
          </div>
        </div>
      </div>

      <div className="healing-events">
        <div className="events-header">
          <h3>Healing Events</h3>
        </div>
        
        <div className="events-list">
          {healingEvents.map((event, index) => (
            <div key={index} className="healing-event">
              <div className="event-header">
                <div className="event-status">
                  <span className="status-icon">{getStatusIcon(event)}</span>
                  <span className="status-text">{getStatusText(event)}</span>
                </div>
                <div className="event-score" style={{ color: getScoreColor(event.score) }}>
                  Score: {event.score}%
                </div>
              </div>
              
              <div className="event-details">
                <div className="locator-comparison">
                  <div className="locator-section">
                    <div className="locator-label">Original (Failed):</div>
                    <code className="locator-code original">{event.originalLocator}</code>
                  </div>
                  
                  <div className="arrow">→</div>
                  
                  <div className="locator-section">
                    <div className="locator-label">Healed:</div>
                    <code className="locator-code healed">{event.healedLocator}</code>
                  </div>
                </div>
                
                <div className="event-metadata">
                  <div className="metadata-item">
                    <strong>Strategy:</strong> {event.strategy}
                  </div>
                  {event.testName && (
                    <div className="metadata-item">
                      <strong>Test:</strong> {event.testName}
                      {event.lineNumber && `:${event.lineNumber}`}
                    </div>
                  )}
                  <div className="metadata-item">
                    <strong>Time:</strong> {new Date(event.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};