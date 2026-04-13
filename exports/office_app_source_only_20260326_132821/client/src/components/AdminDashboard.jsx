import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import moment from 'moment';
import ImageWithFallback from './ImageWithFallback';
import NoticeTicker from './NoticeTicker';
import { getAdminDashboardData } from '../services/adminDashboardService';
import {
  getWhatsAppQr,
  getWhatsAppStatus,
  reconnectWhatsApp,
  sendWhatsAppTestImage,
  sendWhatsAppTestMessage,
  startWhatsApp,
  stopWhatsApp
} from '../services/whatsappService';
import { t } from '../i18n';
import '../styles/AdminDashboard.css';

const fallbackData = {
  stats: { pending: 0, onLeave: 0, offDay: 0, totalStaff: 0 },
  onLeaveList: [],
  recentLeaves: []
};

const AdminDashboard = () => {
  const [whatsAppStatus, setWhatsAppStatus] = useState(null);
  const [whatsAppQr, setWhatsAppQr] = useState(null);
  const [whatsAppBusy, setWhatsAppBusy] = useState(false);
  const [whatsAppError, setWhatsAppError] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [whatsAppAction, setWhatsAppAction] = useState('');
  const [whatsAppInfo, setWhatsAppInfo] = useState('');
  const [whatsAppLastSync, setWhatsAppLastSync] = useState(null);
  const [syncTick, setSyncTick] = useState(Date.now());
  const [autoQrRefreshKey, setAutoQrRefreshKey] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['adminDashboard'],
    queryFn: getAdminDashboardData,
    select: (result) => ({
      stats: { ...fallbackData.stats, ...(result?.stats || {}) },
      onLeaveList: Array.isArray(result?.onLeaveList) ? result.onLeaveList : [],
      recentLeaves: Array.isArray(result?.recentLeaves) ? result.recentLeaves : []
    })
  });

  const dashboard = data || fallbackData;

  useEffect(() => {
    let mounted = true;

    const syncWhatsApp = async () => {
      try {
        const status = await getWhatsAppStatus();
        if (!mounted) return;
        setWhatsAppStatus(status);
        setWhatsAppLastSync(new Date());
        setSyncTick(Date.now());
        setWhatsAppError('');

        if (status?.connected) {
          setQrLoading(false);
          setWhatsAppAction('');
          setWhatsAppInfo('Office sender is live and ready to post approval alerts.');
        } else if (whatsAppAction === 'disconnecting' && status?.state === 'disconnected') {
          setWhatsAppAction('');
          setWhatsAppInfo('Office sender has been disconnected.');
        } else if ((whatsAppAction === 'starting' || whatsAppAction === 'reconnecting') && status?.hasQr) {
          setWhatsAppInfo('QR is ready. Scan it with the official WhatsApp account.');
        } else if ((whatsAppAction === 'starting' || whatsAppAction === 'reconnecting') && status?.state === 'qr') {
          setWhatsAppInfo('Waiting for QR scan from the official WhatsApp account.');
        } else if ((whatsAppAction === 'starting' || whatsAppAction === 'reconnecting') && !status?.hasQr && (status?.state === 'connecting' || status?.state === 'queued_start' || status?.state === 'queued_reconnect')) {
          setWhatsAppInfo('Preparing a secure session and generating a fresh QR.');
        } else if ((whatsAppAction === 'starting' || whatsAppAction === 'reconnecting') && !status?.hasQr && status?.state && status?.state !== 'disconnected') {
          setWhatsAppInfo('QR scanned. Finalizing secure WhatsApp connection...');
        }

        if (status?.hasQr) {
          setQrLoading(false);
          const qr = await getWhatsAppQr();
          if (!mounted) return;
          setWhatsAppQr(qr?.hasQr ? qr : null);
        } else {
          if (status?.state !== 'connecting' && status?.state !== 'queued_start' && status?.state !== 'queued_reconnect') {
            setQrLoading(false);
          }
          setWhatsAppQr(null);
        }
      } catch (err) {
        if (!mounted) return;
        setQrLoading(false);
        setWhatsAppError(err.response?.data?.message || err.message || 'WhatsApp status load failed');
      }
    };

    syncWhatsApp();
    const timer = setInterval(syncWhatsApp, 15000);
    const tickTimer = setInterval(() => setSyncTick(Date.now()), 1000);

    return () => {
      mounted = false;
      clearInterval(timer);
      clearInterval(tickTimer);
    };
  }, [whatsAppAction]);

  const summary = useMemo(() => {
    const total = dashboard.stats.totalStaff || 0;
    const available = Math.max(total - dashboard.stats.onLeave - dashboard.stats.offDay, 0);
    const pendingRate = total > 0 ? Math.round((dashboard.stats.pending / total) * 100) : 0;
    const oldestPending = dashboard.recentLeaves
      .filter((leave) => String(leave.status || '').toLowerCase() === 'pending' && leave.applied_at)
      .map((leave) => new Date(leave.applied_at))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => a - b)[0] || null;
    return { total, available, pendingRate, oldestPending };
  }, [dashboard.stats, dashboard.recentLeaves]);

  const greeting = useMemo(() => {
    const hour = moment().hour();
    if (hour < 12) return t('adminDashboard.morning');
    if (hour < 17) return t('adminDashboard.afternoon');
    return t('adminDashboard.evening');
  }, []);

  const connectionStateMeta = useMemo(() => {
    const state = whatsAppStatus?.state || 'unknown';
    const connected = Boolean(whatsAppStatus?.connected);

    if (whatsAppAction === 'disconnecting') {
      return {
        title: 'Disconnecting office sender',
        detail: 'Closing the active WhatsApp session and clearing the sender link.',
        tone: 'warn',
        step: 3
      };
    }
    if (connected) {
      return {
        title: 'Connected and healthy',
        detail: 'Approval alerts are live and posting to the office group.',
        tone: 'success',
        step: 4
      };
    }
    if (whatsAppStatus?.hasQr || state === 'qr') {
      return {
        title: 'Waiting for QR scan',
        detail: 'Use the official WhatsApp account to scan this QR and authorize the sender.',
        tone: 'primary',
        step: 2
      };
    }
    if (state === 'queued_start' || state === 'queued_reconnect' || qrLoading || whatsAppAction === 'starting' || whatsAppAction === 'reconnecting') {
      return {
        title: 'Preparing secure session',
        detail: 'The worker is starting the browser session and generating a fresh QR.',
        tone: 'primary',
        step: 1
      };
    }
    if (state === 'connecting' || state === 'authenticated') {
      return {
        title: 'Connecting after scan',
        detail: 'QR was received. WhatsApp is finalizing the secure login session.',
        tone: 'primary',
        step: 3
      };
    }
    if (state === 'worker_error' || whatsAppStatus?.error) {
      return {
        title: 'Connection needs attention',
        detail: 'The dashboard cannot fully confirm sender health right now.',
        tone: 'danger',
        step: 0
      };
    }
    return {
      title: 'Sender is idle',
      detail: 'Start or reconnect the office sender to resume approval alerts.',
      tone: 'warn',
      step: 0
    };
  }, [qrLoading, whatsAppAction, whatsAppStatus]);

  const syncAgeLabel = useMemo(() => {
    if (!whatsAppLastSync) return 'Waiting for first sync';
    const seconds = Math.max(0, Math.round((syncTick - whatsAppLastSync.getTime()) / 1000));
    if (seconds < 5) return 'Updated just now';
    if (seconds < 60) return `Updated ${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    return `Updated ${minutes}m ago`;
  }, [syncTick, whatsAppLastSync]);

  const workerHeartbeatLabel = useMemo(() => {
    const seenAt = whatsAppStatus?.lastSeenAt;
    if (!seenAt) return 'Worker heartbeat unavailable';
    const seconds = Math.max(0, Math.round((syncTick - new Date(seenAt).getTime()) / 1000));
    if (seconds < 5) return 'Worker heartbeat just now';
    if (seconds < 60) return `Worker heartbeat ${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    return `Worker heartbeat ${minutes}m ago`;
  }, [syncTick, whatsAppStatus?.lastSeenAt]);

  const qrCountdownLabel = useMemo(() => {
    const qrIssuedAt = whatsAppStatus?.qrIssuedAt || whatsAppStatus?.updatedAt;
    const hasQr = Boolean(whatsAppStatus?.hasQr);
    if (!hasQr || !qrIssuedAt) return '';
    const elapsed = Math.max(0, Math.round((syncTick - new Date(qrIssuedAt).getTime()) / 1000));
    const remaining = Math.max(0, 60 - elapsed);
    if (remaining <= 0) return 'QR is refreshing...';
    return `QR expires in ${remaining}s`;
  }, [syncTick, whatsAppStatus?.hasQr, whatsAppStatus?.qrIssuedAt, whatsAppStatus?.updatedAt]);

  const lastDeliveryLabel = useMemo(() => {
    const completedAt = whatsAppStatus?.lastDelivery?.completedAt;
    if (!completedAt) return 'No recent delivery yet';
    return `Last successful post ${moment(completedAt).fromNow()}`;
  }, [whatsAppStatus?.lastDelivery?.completedAt]);

  const lastApprovalLabel = useMemo(() => {
    const approval = whatsAppStatus?.lastApproval;
    if (!approval?.completedAt) return 'No approval delivery recorded yet';
    const employee = approval.employeeName ? ` for ${approval.employeeName}` : '';
    return `Last approval posted${employee} ${moment(approval.completedAt).fromNow()}`;
  }, [whatsAppStatus?.lastApproval]);

  const recentHistory = useMemo(() => {
    const events = Array.isArray(whatsAppStatus?.recentEvents) ? whatsAppStatus.recentEvents : [];
    return events.map((event) => {
      const labelMap = {
        start: 'Connect started',
        reconnect: 'Reconnect started',
        stop: 'Disconnected',
        send_approval: event.employeeName ? `Approval posted for ${event.employeeName}` : 'Approval posted',
        send_test: 'Text test sent',
        send_test_image: 'Image test sent'
      };
      return {
        label: labelMap[event.jobType] || event.jobType,
        status: event.status,
        time: event.updatedAt || event.completedAt || event.createdAt || null
      };
    });
  }, [whatsAppStatus?.recentEvents]);

  useEffect(() => {
    if (!whatsAppStatus?.hasQr || !qrCountdownLabel || qrCountdownLabel !== 'QR is refreshing...' || whatsAppBusy) return;
    const refreshKey = `${whatsAppStatus?.qrIssuedAt || whatsAppStatus?.updatedAt || ''}`;
    if (!refreshKey || autoQrRefreshKey === refreshKey) return;

    let cancelled = false;
    setAutoQrRefreshKey(refreshKey);
    setWhatsAppInfo('QR expired. Refreshing a new secure QR automatically...');
    setQrLoading(true);
    setWhatsAppQr(null);

    reconnectWhatsApp()
      .then(async () => {
        if (cancelled) return;
        setWhatsAppStatus(await getWhatsAppStatus());
        const qr = await getWhatsAppQr();
        if (cancelled) return;
        setWhatsAppQr(qr?.hasQr ? qr : null);
        setQrLoading(!qr?.hasQr);
      })
      .catch((err) => {
        if (cancelled) return;
        setQrLoading(false);
        setWhatsAppError(err.response?.data?.message || err.message || 'Failed to refresh WhatsApp QR');
      });

    return () => {
      cancelled = true;
    };
  }, [autoQrRefreshKey, qrCountdownLabel, whatsAppBusy, whatsAppStatus]);

  const formatDate = (value) => {
    if (!value) return '-';
    const parsed = moment(value);
    return parsed.isValid() ? parsed.format('DD MMM YYYY') : '-';
  };

  const recentQueue = dashboard.recentLeaves.slice(0, 4);
  const activePeople = dashboard.onLeaveList.slice(0, 5);
  const urgentWarnings = [];
  if (dashboard.stats.pending > 0 && summary.oldestPending) {
    const hoursOld = Math.max(0, Math.round((Date.now() - summary.oldestPending.getTime()) / 36e5));
    if (hoursOld >= 12) urgentWarnings.push(`Oldest pending request is ${hoursOld}h old.`);
  }
  if (whatsAppStatus && !whatsAppStatus.connected) urgentWarnings.push('WhatsApp sender is not connected.');
  if (whatsAppStatus?.error) urgentWarnings.push(`WhatsApp error: ${whatsAppStatus.error}`);

  const WhatsAppPanel = () => {
    const connected = Boolean(whatsAppStatus?.connected);
    const state = whatsAppStatus?.state || 'unknown';
    const lastError = whatsAppStatus?.displayError || whatsAppStatus?.error || '';
    const accountName = whatsAppStatus?.account?.name || 'Office sender';
    const accountNumber = whatsAppStatus?.account?.number || '';
    const accountPlatform = whatsAppStatus?.account?.platform || '';
    const qrText = whatsAppQr?.qr || '';
    const qrImageUrl = qrText ? `https://quickchart.io/qr?size=220&text=${encodeURIComponent(qrText)}` : '';
    const showQrLoading = !connected && qrLoading && !qrImageUrl;
    const timelineSteps = [
      { key: 'prepare', label: 'Prepare session' },
      { key: 'scan', label: 'Scan QR' },
      { key: 'connect', label: 'Connect' },
      { key: 'ready', label: 'Ready' }
    ];

    return (
      <section className="dash-panel whatsapp-panel">
        <div className="dash-panel-head">
          <div>
            <p className="dash-kicker">Messaging</p>
            <h3>Official WhatsApp</h3>
          </div>
          <span className={`status-pill ${connected ? 'success' : 'warn'}`}>
            <i className={`fas ${connected ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}></i>
            {connected ? 'Connected' : state}
          </span>
        </div>

        <p className="dash-copy">{connectionStateMeta.detail}</p>

        <div className={`connection-journey tone-${connectionStateMeta.tone}`}>
          <div className="journey-topline">
            <strong>{connectionStateMeta.title}</strong>
            <span>{syncAgeLabel}</span>
          </div>
          <div className="journey-track">
            {timelineSteps.map((item, index) => {
              const active = connectionStateMeta.step >= index + 1;
              const current = connectionStateMeta.step === index + 1;
              return (
                <div className={`journey-step ${active ? 'active' : ''} ${current ? 'current' : ''}`} key={item.key}>
                  <i className={`fas ${active ? 'fa-circle-check' : 'fa-circle'}`}></i>
                  <span>{item.label}</span>
                </div>
              );
            })}
          </div>
          {whatsAppInfo && <small>{whatsAppInfo}</small>}
        </div>

        <div className="whatsapp-meta-grid">
          <div className="whatsapp-meta-card">
            <span>Worker status</span>
            <strong>{workerHeartbeatLabel}</strong>
          </div>
          <div className="whatsapp-meta-card">
            <span>Delivery health</span>
            <strong>{lastDeliveryLabel}</strong>
          </div>
          <div className="whatsapp-meta-card">
            <span>Latest approval</span>
            <strong>{lastApprovalLabel}</strong>
          </div>
          <div className="whatsapp-meta-card">
            <span>Queue</span>
            <strong>{typeof whatsAppStatus?.pendingJobs === 'number' ? `${whatsAppStatus.pendingJobs} pending job(s)` : 'Queue status unavailable'}</strong>
          </div>
          <div className="whatsapp-meta-card">
            <span>QR timer</span>
            <strong>{qrCountdownLabel || 'Waiting for QR generation'}</strong>
          </div>
        </div>

        <div className="whatsapp-account-card">
          <span>Connected account</span>
          <strong>{accountName}</strong>
          <small>
            {accountNumber ? `Number: ${accountNumber}` : 'Number will appear after login'}
            {accountPlatform ? ` • ${accountPlatform}` : ''}
          </small>
        </div>

        {state !== 'ready' && lastError && (
          <div className="dash-note danger">
            <span>Last error</span>
            <strong>{lastError}</strong>
          </div>
        )}

        {whatsAppError && (
          <div className="dash-note warn">
            <span>UI error</span>
            <strong>{whatsAppError}</strong>
          </div>
        )}

        {showQrLoading && (
          <div className="qr-loading-card">
            <div className="qr-loading-spinner" aria-hidden="true"></div>
            <strong>QR is loading...</strong>
            <span>Preparing a secure WhatsApp connection for the office sender.</span>
          </div>
        )}

        {!connected && qrImageUrl && (
          <div className="qr-frame">
            <img src={qrImageUrl} alt="WhatsApp QR" />
          </div>
        )}

        <div className="panel-actions">
          <button
            type="button"
            className="action-btn primary"
            disabled={whatsAppBusy}
            onClick={async () => {
              setWhatsAppBusy(true);
              setWhatsAppAction('starting');
              setWhatsAppInfo('Starting the office sender and requesting a new QR.');
              setQrLoading(true);
              setWhatsAppQr(null);
              try {
                await startWhatsApp();
                setWhatsAppStatus(await getWhatsAppStatus());
                const qr = await getWhatsAppQr();
                setWhatsAppQr(qr?.hasQr ? qr : null);
                setQrLoading(!qr?.hasQr);
                setWhatsAppError('');
              } catch (err) {
                setWhatsAppAction('');
                setQrLoading(false);
                setWhatsAppError(err.response?.data?.message || err.message || 'Failed to start WhatsApp');
              } finally {
                setWhatsAppBusy(false);
              }
            }}
          >
            Start Connect
          </button>
          <button
            type="button"
            className="action-btn ghost"
            disabled={whatsAppBusy}
            onClick={async () => {
              setWhatsAppBusy(true);
              setWhatsAppAction('reconnecting');
              setWhatsAppInfo('Reconnecting the office sender and refreshing the QR session.');
              setQrLoading(true);
              setWhatsAppQr(null);
              try {
                await reconnectWhatsApp();
                setWhatsAppStatus(await getWhatsAppStatus());
                const qr = await getWhatsAppQr();
                setWhatsAppQr(qr?.hasQr ? qr : null);
                setQrLoading(!qr?.hasQr);
                setWhatsAppError('');
              } catch (err) {
                setWhatsAppAction('');
                setQrLoading(false);
                setWhatsAppError(err.response?.data?.message || err.message || 'Failed to reconnect WhatsApp');
              } finally {
                setWhatsAppBusy(false);
              }
            }}
          >
            Reconnect
          </button>
          {connected && (
            <button
              type="button"
              className="action-btn danger"
              disabled={whatsAppBusy}
              onClick={async () => {
                setWhatsAppBusy(true);
                setWhatsAppAction('disconnecting');
                setWhatsAppInfo('Disconnecting the office sender and clearing the current session link.');
                try {
                  await stopWhatsApp();
                  setWhatsAppStatus(await getWhatsAppStatus());
                  setWhatsAppQr(null);
                  setQrLoading(false);
                  setWhatsAppError('');
                } catch (err) {
                  setWhatsAppAction('');
                  setWhatsAppError(err.response?.data?.message || err.message || 'Failed to disconnect WhatsApp');
                } finally {
                  setWhatsAppBusy(false);
                }
              }}
            >
              Disconnect
            </button>
          )}
          {connected && (
            <button
              type="button"
              className="action-btn ghost"
              disabled={whatsAppBusy}
              onClick={async () => {
                setWhatsAppBusy(true);
                setWhatsAppAction('testing');
                setWhatsAppInfo('Sending a test message to confirm the office group is reachable.');
                try {
                  const response = await sendWhatsAppTestMessage();
                  setWhatsAppStatus(await getWhatsAppStatus());
                  setWhatsAppError('');
                  setWhatsAppInfo(response?.result?.queued
                    ? 'Test message was queued for the worker. It should reach the group shortly.'
                    : 'Test message sent successfully to the office group.');
                } catch (err) {
                  setWhatsAppError(err.response?.data?.message || err.message || 'Failed to send WhatsApp test message');
                } finally {
                  setWhatsAppAction('');
                  setWhatsAppBusy(false);
                }
              }}
            >
              Test message
            </button>
          )}
          {connected && (
            <button
              type="button"
              className="action-btn ghost"
              disabled={whatsAppBusy}
              onClick={async () => {
                setWhatsAppBusy(true);
                setWhatsAppAction('testing');
                setWhatsAppInfo('Sending an image test to verify WhatsApp media delivery.');
                try {
                  const response = await sendWhatsAppTestImage();
                  setWhatsAppStatus(await getWhatsAppStatus());
                  setWhatsAppError('');
                  setWhatsAppInfo(response?.result?.queued
                    ? 'Test image was queued for the worker. It should reach the group shortly.'
                    : 'Test image sent successfully to the office group.');
                } catch (err) {
                  setWhatsAppError(err.response?.data?.message || err.message || 'Failed to send WhatsApp test image');
                } finally {
                  setWhatsAppAction('');
                  setWhatsAppBusy(false);
                }
              }}
            >
              Test image
            </button>
          )}
        </div>

        <div className="whatsapp-history">
          <div className="history-head">
            <span>Recent connection history</span>
          </div>
          {recentHistory.length === 0 ? (
            <div className="empty-state">No recent WhatsApp events yet.</div>
          ) : (
            recentHistory.map((event, index) => (
              <div className="history-row" key={`${event.label}-${index}`}>
                <div className={`history-dot status-${String(event.status || '').toLowerCase()}`}></div>
                <div className="history-copy">
                  <strong>{event.label}</strong>
                  <span>{event.time ? moment(event.time).fromNow() : 'time unavailable'}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="panel-foot">
          Current state: <strong>{state}</strong> • Last sync: <strong>{syncAgeLabel.replace('Updated ', '')}</strong>
        </div>
      </section>
    );
  };

  const QuickLink = ({ icon, label, to, tone }) => (
    <Link className={`quick-link tone-${tone}`} to={to}>
      <div className="quick-icon"><i className={`fas ${icon}`}></i></div>
      <div className="quick-text">
        <strong>{label}</strong>
        <span>Open now</span>
      </div>
    </Link>
  );

  return (
    <div className="admin-dash-shell">
      <NoticeTicker />

      {isLoading ? (
        <div className="admin-skeleton-v2">
          <div className="sk-hero"></div>
          <div className="sk-grid"></div>
          <div className="sk-main"></div>
          <div className="sk-side"></div>
        </div>
      ) : error ? (
        <div className="dash-error">
          {error.message || t('adminDashboard.dashboardLoadError')}
        </div>
      ) : (
        <>
          <section className="admin-hero">
            <div className="hero-left">
              <div className="hero-topline">
                <span className="badge-chip">Admin Control Center</span>
                {dashboard.stats.pending > 0 && (
                  <Link className="badge-chip pending" to="/manage-leaves?status=Pending">
                    {dashboard.stats.pending} pending approvals
                  </Link>
                )}
              </div>

              <h1>
                {greeting}, <span>Admin</span>
              </h1>
              <p className="hero-subtitle">
                Track leave activity, approvals, and office WhatsApp health from one modern control room.
              </p>

              <div className="hero-metrics">
                <div className="metric-card">
                  <span>Team</span>
                  <strong>{summary.total}</strong>
                </div>
                <div className="metric-card accent">
                  <span>Pending</span>
                  <strong>{dashboard.stats.pending}</strong>
                </div>
              </div>

              <div className="hero-actions">
                <Link to="/manage-leaves?status=Pending" className="hero-btn primary">
                  <i className="fas fa-bolt"></i>
                  Review queue
                </Link>
                <Link to="/leave-report" className="hero-btn secondary">
                  <i className="fas fa-chart-column"></i>
                  Reports
                </Link>
                <Link to="/monthly-summary" className="hero-btn secondary">
                  <i className="fas fa-calendar-days"></i>
                  Monthly summary
                </Link>
              </div>

              <div className="info-strip">
                <div className="info-chip">
                  <span>Pending rate</span>
                  <strong>{summary.pendingRate}%</strong>
                </div>
                <div className="info-chip">
                  <span>Oldest pending</span>
                  <strong>{summary.oldestPending ? moment(summary.oldestPending).fromNow() : 'None'}</strong>
                </div>
              </div>
            </div>

            <div className="hero-right">
              <div className="hero-stack">
                <div className="hero-stat big">
                  <span>Pending queue</span>
                  <strong>{dashboard.stats.pending}</strong>
                  <small>Needs admin review</small>
                </div>
                <div className="hero-stat">
                  <span>Available</span>
                  <strong>{summary.available}</strong>
                </div>
                <div className="hero-stat">
                  <span>Work ready</span>
                  <strong>{summary.total > 0 ? `${Math.round((summary.available / summary.total) * 100)}%` : '0%'}</strong>
                </div>
                <div className="hero-stat">
                  <span>On leave</span>
                  <strong>{dashboard.stats.onLeave}</strong>
                </div>
              </div>
            </div>
          </section>

          <section className="quick-rail">
            <QuickLink icon="fa-list-check" label="Manage leaves" to="/manage-leaves" tone="blue" />
            <QuickLink icon="fa-users" label="Employees" to="/employees" tone="violet" />
            <QuickLink icon="fa-file-lines" label="Leave report" to="/leave-report" tone="green" />
            <QuickLink icon="fa-signal" label="Monthly summary" to="/monthly-summary" tone="amber" />
          </section>

          <section className="dashboard-layout">
            <div className="dashboard-main">
              <article className="dash-panel feed-panel">
                <div className="dash-panel-head">
                  <div>
                    <p className="dash-kicker">Recent activity</p>
                    <h3>Latest leave requests</h3>
                  </div>
                  <Link to="/manage-leaves" className="panel-link">Open all</Link>
                </div>

                <div className="activity-feed">
                  {recentQueue.length === 0 ? (
                    <div className="empty-state">No recent leave activity.</div>
                  ) : (
                    recentQueue.map((leave, index) => (
                      <div className="feed-row" key={leave.id || index}>
                        <ImageWithFallback
                          src={leave.profile_pic ? `/uploads/${leave.profile_pic}` : null}
                          fallbackName={leave.full_name}
                          className="feed-avatar"
                          alt=""
                          width="42px"
                          height="42px"
                        />
                        <div className="feed-body">
                          <div className="feed-title">
                            <strong>{leave.full_name}</strong>
                            <span className={leave.status === 'Approved' ? 'feed-badge approved' : leave.status === 'Rejected' ? 'feed-badge rejected' : 'feed-badge pending'}>
                              {leave.status}
                            </span>
                          </div>
                          <div className="feed-meta">
                            <span>{leave.type_name}</span>
                            <span>{formatDate(leave.from_date)} - {formatDate(leave.to_date)}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>

              <article className="dash-panel table-panel">
                <div className="dash-panel-head">
                  <div>
                    <p className="dash-kicker">Team status</p>
                    <h3>Who is out today</h3>
                  </div>
                  <span className="panel-chip">{activePeople.length} active</span>
                </div>

                <div className="table-wrap">
                  {activePeople.length === 0 ? (
                    <div className="empty-state">Everyone is present today.</div>
                  ) : (
                    activePeople.map((staff, index) => (
                      <div className="team-row-v2" key={`${staff.full_name}-${index}`}>
                        <ImageWithFallback
                          src={staff.profile_pic ? `/uploads/${staff.profile_pic}` : null}
                          fallbackName={staff.full_name}
                          className="team-avatar"
                          alt=""
                          width="36px"
                          height="36px"
                        />
                        <div className="team-copy">
                          <strong>{staff.full_name}</strong>
                          <span>{staff.leave_type || t('adminDashboard.leaveGeneric')}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>
            </div>

            <aside className="dashboard-side">
              <WhatsAppPanel />

              <article className="dash-panel alert-panel">
                <div className="dash-panel-head">
                  <div>
                    <p className="dash-kicker">Alerts</p>
                    <h3>What needs attention</h3>
                  </div>
                </div>
                <div className="alert-list">
                  {urgentWarnings.length === 0 ? (
                    <div className="empty-state">No urgent alerts right now.</div>
                  ) : (
                    urgentWarnings.map((warning, index) => (
                      <div className="alert-row" key={`${warning}-${index}`}>
                        <i className="fas fa-triangle-exclamation"></i>
                        <span>{warning}</span>
                      </div>
                    ))
                  )}
                </div>
              </article>

              <article className="dash-panel stats-panel">
                <div className="dash-panel-head">
                  <div>
                    <p className="dash-kicker">Live stats</p>
                    <h3>Today overview</h3>
                  </div>
                </div>

                <div className="mini-stats">
                  <div className="mini-card">
                    <span>Present</span>
                    <strong>{Math.max(summary.total - dashboard.stats.onLeave - dashboard.stats.offDay, 0)}</strong>
                  </div>
                  <div className="mini-card">
                    <span>On leave</span>
                    <strong>{dashboard.stats.onLeave}</strong>
                  </div>
                  <div className="mini-card">
                    <span>Off day</span>
                    <strong>{dashboard.stats.offDay}</strong>
                  </div>
                  <div className="mini-card accent">
                    <span>Pending</span>
                    <strong>{dashboard.stats.pending}</strong>
                  </div>
                </div>
              </article>
            </aside>
          </section>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
