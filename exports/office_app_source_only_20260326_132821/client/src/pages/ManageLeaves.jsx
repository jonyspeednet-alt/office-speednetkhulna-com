import React, { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import moment from 'moment';
import Swal from 'sweetalert2';
import ImageWithFallback from '../components/ImageWithFallback';
import { getLeaveRequests, updateLeaveStatus } from '../services/leaveService';
import { t } from '../i18n';
import '../styles/AdminDashboard.css';
import '../styles/ManageLeaves.css';

const STATUS_TABS = ['All', 'Pending', 'Approved', 'Rejected'];
const statusPriority = (status) => (String(status || '').toLowerCase() === 'pending' ? 0 : 1);
const PAGE_SIZE = 20;
const now = new Date();
const DEFAULT_MONTH = String(now.getMonth() + 1);
const DEFAULT_YEAR = String(now.getFullYear());

const statusLabel = (status) => {
  if (status === 'Pending') return t('manageLeaves.statusPending');
  if (status === 'Approved') return t('manageLeaves.statusApproved');
  if (status === 'Rejected') return t('manageLeaves.statusRejected');
  return t('manageLeaves.statusAll');
};

const ManageLeaves = () => {
  const queryClient = useQueryClient();
  const [activeStatus, setActiveStatus] = useState('All');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [filters, setFilters] = useState({ search: '', month: DEFAULT_MONTH, year: DEFAULT_YEAR });
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  const [page, setPage] = useState(1);
  const [busyActionId, setBusyActionId] = useState(null);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(filters.search), 400);
    return () => clearTimeout(handler);
  }, [filters.search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters.month, filters.year, activeStatus]);

  const { data, isLoading: loading, error: fetchError } = useQuery({
    queryKey: ['leaveRequests', debouncedSearch, filters.month, filters.year, activeStatus, page],
    queryFn: () =>
      getLeaveRequests({
        search: debouncedSearch,
        month: filters.month,
        year: filters.year,
        status: activeStatus,
        page,
        limit: PAGE_SIZE
      }),
    placeholderData: (prev) => prev,
  });
  const requests = data?.items || [];
  const pagination = data?.pagination || { page: 1, total_pages: 1, total_items: requests.length };

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => updateLeaveStatus(id, status),
    onMutate: async ({ id, status }) => {
      const previousQueries = queryClient.getQueriesData({ queryKey: ['leaveRequests'] });
      setBusyActionId(id);
      queryClient.setQueriesData({ queryKey: ['leaveRequests'] }, (oldData) => {
        if (!oldData || !Array.isArray(oldData.items)) return oldData;
        return {
          ...oldData,
          items: oldData.items.map((group) => {
            if (String(group.first_id) !== String(id)) return group;
            return {
              ...group,
              status,
              leaves: Array.isArray(group.leaves)
                ? group.leaves.map((leaf) => ({ ...leaf, status }))
                : group.leaves
            };
          })
        };
      });
      return { previousQueries };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['leaveRequests'], exact: false });
      await queryClient.refetchQueries({ queryKey: ['leaveRequests'], exact: false, type: 'active' });
      Swal.fire({
        title: t('manageLeaves.updateTitle'),
        text: t('manageLeaves.updateSuccess'),
        icon: 'success',
        timer: 1400,
        showConfirmButton: false
      });
    },
    onError: (err, _variables, context) => {
      if (context?.previousQueries) {
        context.previousQueries.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      Swal.fire({
        title: t('manageLeaves.updateFailedTitle'),
        text: err.message || t('manageLeaves.updateFailed'),
        icon: 'error'
      });
    },
    onSettled: () => {
      setBusyActionId(null);
    }
  });

  const stats = useMemo(
    () =>
      requests.reduce(
        (acc, group) => {
          const currentStatus = String(group.status || '').toLowerCase();
          if (currentStatus === 'pending') acc.pending += 1;
          if (currentStatus === 'approved') acc.approved += 1;
          if (currentStatus === 'rejected') acc.rejected += 1;
          acc.total += 1;
          return acc;
        },
        { pending: 0, approved: 0, rejected: 0, total: 0 }
      ),
    [requests]
  );

  const filteredRequests = useMemo(() => {
    const base = Array.isArray(requests) ? [...requests] : [];
    base.sort((a, b) => {
      const byPending = statusPriority(a?.status) - statusPriority(b?.status);
      if (byPending !== 0) return byPending;
      return Number(b?.first_id || 0) - Number(a?.first_id || 0);
    });

    return base;
  }, [requests]);

  const handleFilterChange = (event) => {
    setFilters((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  const handleReset = () => {
    setFilters({ search: '', month: DEFAULT_MONTH, year: DEFAULT_YEAR });
    setActiveStatus('All');
    setPage(1);
  };

  const toggleGroup = (groupId) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const getStatusClass = (status) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'approved') return 'approved';
    if (normalized === 'rejected') return 'rejected';
    return 'pending';
  };

  const openReasonModal = (text) => {
    Swal.fire({
      title: t('manageLeaves.leaveReasonTitle'),
      text: text || t('manageLeaves.noReason'),
      icon: 'info',
      confirmButtonColor: '#1756d9'
    });
  };

  const handleStatusUpdate = async (id, status) => {
    if (statusMutation.isPending || busyActionId) return;

    const actionLabel =
      status === 'Approved'
        ? t('manageLeaves.actionApprove')
        : status === 'Rejected'
          ? t('manageLeaves.actionReject')
          : t('manageLeaves.actionPending');

    const confirmColor = status === 'Approved' ? '#0f9d58' : status === 'Rejected' ? '#dc3545' : '#f59f00';

    const result = await Swal.fire({
      title: t('manageLeaves.confirmTitle'),
      text: t('manageLeaves.confirmText', { action: actionLabel }),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: confirmColor,
      confirmButtonText: t('manageLeaves.confirmYes'),
      cancelButtonText: t('manageLeaves.cancel')
    });

    if (result.isConfirmed) {
      statusMutation.mutate({ id, status });
    }
  };

  const error = fetchError?.response?.data?.message || fetchError?.message;

  return (
    <>
      <section className="mlv-hero">
        <div>
          <span className="mlv-label">
            <i className="fas fa-calendar-check"></i>
            {t('manageLeaves.heroTag')}
          </span>
          <h1>{t('manageLeaves.heroTitle')}</h1>
          <p>{t('manageLeaves.heroSubtitle')}</p>
          <div className="mlv-meta">
            <span>
              <i className="fas fa-building"></i>
              Speed Net Khulna
            </span>
            <span>
              <i className="fas fa-calendar-day"></i>
              {moment().format('DD MMMM, YYYY')}
            </span>
          </div>
        </div>
        <div className="mlv-kpi-grid">
          <article className="mlv-kpi total">
            <span>{t('manageLeaves.total')}</span>
            <strong>{stats.total}</strong>
          </article>
          <article className="mlv-kpi pending">
            <span>{t('manageLeaves.pending')}</span>
            <strong>{stats.pending}</strong>
          </article>
          <article className="mlv-kpi approved">
            <span>{t('manageLeaves.approved')}</span>
            <strong>{stats.approved}</strong>
          </article>
          <article className="mlv-kpi rejected">
            <span>{t('manageLeaves.rejected')}</span>
            <strong>{stats.rejected}</strong>
          </article>
        </div>
      </section>

      <section className="mlv-toolbar">
        <form onSubmit={(e) => e.preventDefault()} className="mlv-filter-form">
          <div className="mlv-input with-icon">
            <i className="fas fa-search"></i>
            <input
              type="text"
              name="search"
              placeholder={t('manageLeaves.searchPlaceholder')}
              value={filters.search}
              onChange={handleFilterChange}
            />
          </div>
          <select name="month" value={filters.month} onChange={handleFilterChange}>
            {Array.from({ length: 12 }, (_, idx) => (
              <option key={idx + 1} value={idx + 1}>
                {moment(idx + 1, 'M').format('MMMM')}
              </option>
            ))}
          </select>
          <select name="year" value={filters.year} onChange={handleFilterChange}>
            {Array.from({ length: 6 }, (_, idx) => {
              const year = new Date().getFullYear() - 3 + idx;
              return (
                <option key={year} value={year}>
                  {year}
                </option>
              );
            })}
          </select>
          <button type="button" className="mlv-btn secondary" onClick={handleReset}>
            <i className="fas fa-rotate"></i>
            {t('manageLeaves.reset')}
          </button>
        </form>

        <div className="mlv-status-tabs" role="tablist" aria-label={t('manageLeaves.errorAria')}>
          {STATUS_TABS.map((status) => (
            <button
              key={status}
              type="button"
              className={`mlv-status-tab ${activeStatus === status ? 'active' : ''}`}
              onClick={() => setActiveStatus(status)}
            >
              {statusLabel(status)}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <section className="mlv-error">
          <i className="fas fa-circle-exclamation"></i>
          <span>{error}</span>
        </section>
      )}

      <section className="mlv-table-card">
        <header>
          <h2>{t('manageLeaves.listTitle')}</h2>
          <p>
            {loading
              ? t('manageLeaves.loadingData')
              : `${t('manageLeaves.groupFound', { count: filteredRequests.length })} | Total: ${pagination.total_items}`}
          </p>
        </header>
        <div className="table-responsive">
          <table className="table align-middle mb-0 mlv-table">
            <thead>
              <tr>
                <th className="expand-col"></th>
                <th>{t('manageLeaves.employee')}</th>
                <th>{t('manageLeaves.leaveDetails')}</th>
                <th>{t('manageLeaves.dateRange')}</th>
                <th>{t('manageLeaves.days')}</th>
                <th>{t('manageLeaves.status')}</th>
                <th className="text-end">{t('manageLeaves.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="7" className="text-center py-5">
                    <div className="spinner-border text-primary" role="status">
                      <span className="visually-hidden">{t('manageLeaves.loading')}</span>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && filteredRequests.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center py-5 text-muted">
                    <i className="fas fa-folder-open d-block mb-3 fs-1 opacity-25"></i>
                    {t('manageLeaves.noRecords')}
                  </td>
                </tr>
              )}

              {!loading &&
                filteredRequests.map((group, index) => {
                  const leaves = Array.isArray(group.leaves) ? group.leaves : [];
                  if (leaves.length === 0) return null;

                  const groupId = `group_${group.first_id || index}`;
                  const isExpanded = Boolean(expandedGroups[groupId]);
                  const hasMultipleRows = leaves.length > 1;
                  const totalDays = leaves.reduce((sum, item) => sum + Number(item.actual_days || 0), 0);
                  const minStart = leaves.reduce(
                    (minDate, current) =>
                      !minDate || new Date(current.start_date) < new Date(minDate) ? current.start_date : minDate,
                    null
                  );
                  const maxEnd = leaves.reduce(
                    (maxDate, current) =>
                      !maxDate || new Date(current.end_date) > new Date(maxDate) ? current.end_date : maxDate,
                    null
                  );
                  const statusClass = getStatusClass(group.status);

                  return (
                    <React.Fragment key={groupId}>
                      <tr
                        className={`mlv-main-row ${isExpanded ? 'expanded' : ''}`}
                        onClick={() => hasMultipleRows && toggleGroup(groupId)}
                      >
                        <td className="expand-col">
                          {hasMultipleRows ? (
                            <i className={`fas fa-chevron-right ${isExpanded ? 'rotated' : ''}`}></i>
                          ) : (
                            <i className="fas fa-circle static-dot"></i>
                          )}
                        </td>
                        <td>
                          <div className="mlv-employee">
                            <ImageWithFallback
                              src={group.user_info?.profile_pic ? `/uploads/${group.user_info.profile_pic}` : null}
                              fallbackName={group.user_info?.full_name || t('manageLeaves.employeeFallback')}
                              className="mlv-avatar"
                              width="44px"
                              height="44px"
                            />
                            <div>
                              <strong>{group.user_info?.full_name || t('manageLeaves.unknownEmployee')}</strong>
                              <small>{t('manageLeaves.idLabel')}: {group.user_info?.employee_id || '-'}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="mlv-detail">
                            <strong>{hasMultipleRows ? t('manageLeaves.segments', { count: leaves.length }) : leaves[0].leave_type_name}</strong>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openReasonModal(group.reason);
                              }}
                            >
                              {t('manageLeaves.viewReason')}
                            </button>
                          </div>
                        </td>
                        <td>
                          <strong>
                            {moment(minStart).format('DD MMM')} - {moment(maxEnd).format('DD MMM, YYYY')}
                          </strong>
                          {hasMultipleRows && <small>{t('manageLeaves.groupedLines', { count: leaves.length })}</small>}
                        </td>
                        <td>
                          <span className="mlv-days-badge">{totalDays}</span>
                        </td>
                        <td>
                          <span className={`mlv-status ${statusClass}`}>{statusLabel(group.status)}</span>
                        </td>
                        <td className="text-end" onClick={(event) => event.stopPropagation()}>
                          <div className="mlv-actions">
                            {group.status === 'Pending' && (
                              <>
                                <button
                                  type="button"
                                  className="ok"
                                  title={t('manageLeaves.approve')}
                                disabled={statusMutation.isPending && busyActionId === group.first_id}
                                onClick={() => handleStatusUpdate(group.first_id, 'Approved')}
                              >
                                  <i className="fas fa-check"></i>
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  title={t('manageLeaves.reject')}
                                disabled={statusMutation.isPending && busyActionId === group.first_id}
                                onClick={() => handleStatusUpdate(group.first_id, 'Rejected')}
                              >
                                  <i className="fas fa-xmark"></i>
                                </button>
                              </>
                            )}

                            {group.status !== 'Pending' && (
                              <>
                                <button
                                  type="button"
                                  className="warn"
                                  title={t('manageLeaves.movePending')}
                                  disabled={statusMutation.isPending && busyActionId === group.first_id}
                                  onClick={() => handleStatusUpdate(group.first_id, 'Pending')}
                                >
                                  <i className="fas fa-rotate-left"></i>
                                </button>
                                {group.status === 'Approved' && (
                                  <a href={`/approval/${group.first_id}`} target="_blank" rel="noreferrer" title={t('manageLeaves.printApproval')}>
                                    <i className="fas fa-print"></i>
                                  </a>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isExpanded &&
                        leaves.map((leaf) => (
                          <tr key={leaf.id} className="mlv-sub-row">
                            <td></td>
                            <td></td>
                            <td>
                              <div className="mlv-sub-detail">
                                <span className="line-mark"></span>
                                <div>
                                  <strong>{leaf.leave_type_name}</strong>
                                  {Number(leaf.leave_type_id) === 3 && leaf.half_day_period && <small>{leaf.half_day_period}</small>}
                                </div>
                              </div>
                            </td>
                            <td>
                              {moment(leaf.start_date).format('DD MMM')} - {moment(leaf.end_date).format('DD MMM, YYYY')}
                            </td>
                            <td>{leaf.actual_days}</td>
                            <td></td>
                            <td></td>
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
        {!loading && pagination.total_pages > 1 && (
          <div className="d-flex align-items-center justify-content-between px-3 py-3 border-top">
            <small className="text-muted">
              Page {pagination.page} of {pagination.total_pages}
            </small>
            <div className="btn-group">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={pagination.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={pagination.page >= pagination.total_pages}
                onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
};

export default ManageLeaves;
