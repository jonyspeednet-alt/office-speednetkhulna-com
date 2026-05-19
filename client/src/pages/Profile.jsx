import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { getUserProfile } from "../services/profileService";
import { changePassword } from "../services/authService";
import ImageWithFallback from "../components/ImageWithFallback";
import moment from "moment";
import { t } from "../i18n";
import "../styles/AdminDashboard.css";

const Profile = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  })();
  const currentUserId = Number(currentUser?.id || 0);
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [filters, setFilters] = useState({
    month: "",
    year: new Date().getFullYear(),
  });
  const [pwForm, setPwForm] = useState({
    current: "",
    newPass: "",
    confirm: "",
  });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const data = await getUserProfile(id, filters.month, filters.year);
      setProfileData(data);
    } catch (error) {
      console.error(t("profile.loadFailed"), error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [id, filters.month, filters.year]);

  if (loading)
    return (
      <div className="d-flex flex-column justify-content-center align-items-center h-100 py-5">
        <div className="loader-container text-center">
          <div
            className="spinner-border text-primary"
            role="status"
            style={{ width: "3rem", height: "3rem" }}
          ></div>
          <p className="mt-3 fw-bold text-primary">{t("profile.loading")}</p>
        </div>
      </div>
    );

  if (!profileData)
    return (
      <div className="d-flex flex-column justify-content-center align-items-center h-100 py-5 text-center">
        <div className="error-card glass-card p-5">
          <div className="display-1 fw-bold text-danger opacity-25">404</div>
          <h2 className="fw-bold text-dark">{t("profile.notFound")}</h2>
          <p className="text-muted mb-4">{t("profile.notFoundText")}</p>
          <button
            onClick={() => navigate("/employees")}
            className="btn btn-primary rounded-pill px-5 shadow"
          >
            {t("profile.backToEmployees")}
          </button>
        </div>
      </div>
    );

  const { user, leaves, filteredTotalDays } = profileData;
  const canEditOwnProfile = Number(user?.id) === currentUserId;

  // Show employee ID to: own profile, or users with 'Edit Any Profile' OR 'Employees' permission.
  // Others see nothing (backend already nulls the employee_id for them).
  const canViewEmployeeId =
    canEditOwnProfile ||
    Boolean(
      currentUser?.all_access ||
      currentUser?.p_edit_any_profile ||
      currentUser?.p_employees ||
      currentUser?.permissions?.all_access ||
      currentUser?.permissions?.p_edit_any_profile ||
      currentUser?.permissions?.p_employees,
    );

  const displayId = user?.employee_id || user?.emp_id;

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");

    if (pwForm.newPass !== pwForm.confirm) {
      setPwError("নতুন পাসওয়ার্ড এবং নিশ্চিতকরণ পাসওয়ার্ড মিলছে না");
      return;
    }
    if (pwForm.newPass.length < 4) {
      setPwError("নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে");
      return;
    }

    setPwLoading(true);
    try {
      await changePassword(pwForm.current, pwForm.newPass);
      setPwSuccess("পাসওয়ার্ড সফলভাবে পরিবর্তন হয়েছে ✓");
      setPwForm({ current: "", newPass: "", confirm: "" });
    } catch (err) {
      setPwError(err.message || "পাসওয়ার্ড পরিবর্তন ব্যর্থ হয়েছে");
    } finally {
      setPwLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "Approved":
        return (
          <span className="badge bg-success-soft text-success">
            {t("profile.approved")}
          </span>
        );
      case "Rejected":
        return (
          <span className="badge bg-danger-soft text-danger">
            {t("profile.rejected")}
          </span>
        );
      default:
        return (
          <span className="badge bg-warning-soft text-warning">
            {t("profile.pending")}
          </span>
        );
    }
  };

  return (
    <>
      <div className="profile-header-container mb-4">
        <div className="profile-banner"></div>
        <div className="profile-info-overlay glass-card">
          <div className="row align-items-end g-4">
            <div className="col-auto">
              <div className="profile-avatar-wrapper">
                <ImageWithFallback
                  src={user.profile_pic ? `/uploads/${user.profile_pic}` : null}
                  fallbackName={user.full_name}
                  alt={user.full_name}
                  className="profile-avatar shadow-lg"
                  width="140px"
                  height="140px"
                />
                <div
                  className={`status-indicator ${user.can_take_action ? "active" : ""}`}
                ></div>
              </div>
            </div>
            <div className="col">
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-3">
                <div className="profile-titles">
                  <div className="d-flex align-items-center mb-1">
                    <h1 className="user-name mb-0">{user.full_name}</h1>
                    {canViewEmployeeId && displayId && (
                      <span
                        className="ms-3 badge bg-primary-soft text-primary border border-primary-subtle px-3 py-2 rounded-pill"
                        style={{
                          fontSize: "0.9rem",
                          fontWeight: "700",
                          letterSpacing: "0.5px",
                        }}
                      >
                        <i className="fas fa-id-badge me-2"></i>
                        {displayId}
                      </span>
                    )}
                  </div>
                  <div className="user-meta d-flex gap-3 flex-wrap">
                    <span>
                      <i className="fas fa-briefcase me-1"></i>{" "}
                      {user.designation || t("profile.staff")}
                    </span>
                    <span>
                      <i className="fas fa-layer-group me-1"></i>{" "}
                      {user.department}
                    </span>
                  </div>
                </div>
                <div className="profile-actions d-flex gap-2">
                  {canEditOwnProfile && (
                    <button
                      onClick={() => navigate(`/edit-employee/${user.id}`)}
                      className="btn btn-primary-glass"
                    >
                      <i className="fas fa-user-edit me-2"></i>
                      {t("profile.editProfile")}
                    </button>
                  )}
                  <button
                    onClick={() => navigate("/employees")}
                    className="btn btn-light-glass"
                  >
                    <i className="fas fa-chevron-left me-2"></i>
                    {t("profile.back")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="profile-tabs-container mb-4">
        <div className="nav nav-pills glass-card p-2 d-inline-flex">
          <button
            className={`nav-link ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >
            <i className="fas fa-th-large me-2"></i>
            {t("profile.tabOverview")}
          </button>
          <button
            className={`nav-link ${activeTab === "details" ? "active" : ""}`}
            onClick={() => setActiveTab("details")}
          >
            <i className="fas fa-info-circle me-2"></i>
            {t("profile.tabDetails")}
          </button>
          <button
            className={`nav-link ${activeTab === "leaves" ? "active" : ""}`}
            onClick={() => setActiveTab("leaves")}
          >
            <i className="fas fa-calendar-alt me-2"></i>
            {t("profile.tabLeaves")}
          </button>
          {canEditOwnProfile && (
            <button
              className={`nav-link ${activeTab === "security" ? "active" : ""}`}
              onClick={() => setActiveTab("security")}
            >
              <i className="fas fa-lock me-2"></i>পাসওয়ার্ড
            </button>
          )}
        </div>
      </div>

      <div className="tab-content">
        {activeTab === "overview" && (
          <div className="fade-in">
            <div className="row g-4">
              <div className="col-lg-8">
                <div className="widget-card glass-card p-4">
                  <div className="d-flex justify-content-between align-items-center mb-4">
                    <h5 className="section-title">
                      <i className="fas fa-chart-pie me-2"></i>
                      {t("profile.leaveStatsYear")}
                    </h5>
                    <div className="badge bg-primary px-3 py-2">
                      {filters.year}
                    </div>
                  </div>
                  <div className="row g-3">
                    <div className="col-md-4">
                      <div className="stat-box text-center p-4 rounded-4 bg-primary-soft">
                        <div className="stat-label">
                          {t("profile.totalLeaveDays")}
                        </div>
                        <div className="stat-value text-primary">
                          {filteredTotalDays}
                        </div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="stat-box text-center p-4 rounded-4 bg-success-soft">
                        <div className="stat-label">
                          {t("profile.approvedRequests")}
                        </div>
                        <div className="stat-value text-success">
                          {leaves.filter((l) => l.status === "Approved").length}
                        </div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="stat-box text-center p-4 rounded-4 bg-warning-soft">
                        <div className="stat-label">{t("profile.pending")}</div>
                        <div className="stat-value text-warning">
                          {
                            leaves.filter(
                              (l) => l.status === "Pending" || !l.status,
                            ).length
                          }
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-top">
                    <h6 className="mb-3 fw-bold">
                      {t("profile.workplaceInfo")}
                    </h6>
                    <div className="row g-3">
                      <div className="col-6 col-md-3">
                        <div className="small text-muted">
                          {t("profile.weeklyOff")}
                        </div>
                        <div className="fw-bold">
                          {user.weekly_off || t("profile.defaultWeeklyOff")}
                        </div>
                      </div>
                      <div className="col-6 col-md-3">
                        <div className="small text-muted">
                          {t("profile.joiningDate")}
                        </div>
                        <div className="fw-bold">
                          {user.joining_date
                            ? moment(user.joining_date).format("DD MMM, YYYY")
                            : "N/A"}
                        </div>
                      </div>
                      <div className="col-6 col-md-3">
                        <div className="small text-muted">
                          {t("profile.roleDesignation")}
                        </div>
                        <div className="fw-bold">
                          {user.can_take_action
                            ? t("profile.adminManager")
                            : t("profile.normalUser")}
                        </div>
                      </div>
                      <div className="col-6 col-md-3">
                        <div className="small text-muted">
                          {t("profile.status")}
                        </div>
                        <div className="fw-bold text-success">
                          {t("profile.active")}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-lg-4">
                <div className="widget-card glass-card p-4 h-100">
                  <h5 className="section-title mb-4">
                    <i className="fas fa-address-book me-2"></i>
                    {t("profile.contacts")}
                  </h5>
                  <div className="contact-item mb-3">
                    <div className="icon-circle bg-light me-3">
                      <i className="fas fa-envelope text-primary"></i>
                    </div>
                    <div>
                      <div className="small text-muted">
                        {t("profile.email")}
                      </div>
                      <div className="fw-bold text-break">
                        {user.email || "N/A"}
                      </div>
                    </div>
                  </div>
                  <div className="contact-item mb-3">
                    <div className="icon-circle bg-light me-3">
                      <i className="fas fa-phone text-success"></i>
                    </div>
                    <div>
                      <div className="small text-muted">
                        {t("profile.phone")}
                      </div>
                      <div className="fw-bold">{user.phone}</div>
                    </div>
                  </div>
                  <div className="contact-item">
                    <div className="icon-circle bg-light me-3">
                      <i className="fas fa-tint text-danger"></i>
                    </div>
                    <div>
                      <div className="small text-muted">
                        {t("profile.bloodGroup")}
                      </div>
                      <div className="fw-bold text-danger">
                        {user.blood_group || t("profile.unknown")}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "details" && (
          <div className="fade-in">
            <div className="row g-4">
              <div className="col-lg-6">
                <div className="widget-card glass-card p-4">
                  <h5 className="section-title mb-4">
                    <i className="fas fa-map-marker-alt me-2"></i>
                    {t("profile.addresses")}
                  </h5>
                  <div className="address-card p-3 rounded-4 bg-light mb-3">
                    <div className="text-primary fw-bold mb-1">
                      <i className="fas fa-home me-2"></i>
                      {t("profile.presentAddress")}
                    </div>
                    <p className="mb-0 text-muted">
                      {user.present_address || t("profile.noInfo")}
                    </p>
                  </div>
                  <div className="address-card p-3 rounded-4 bg-light">
                    <div className="text-primary fw-bold mb-1">
                      <i className="fas fa-building me-2"></i>
                      {t("profile.permanentAddress")}
                    </div>
                    <p className="mb-0 text-muted">
                      {user.permanent_address || t("profile.noInfo")}
                    </p>
                  </div>
                </div>
              </div>
              <div className="col-lg-6">
                <div className="widget-card glass-card p-4 h-100">
                  <h5 className="section-title mb-4">
                    <i className="fas fa-id-card me-2"></i>
                    {t("profile.nidTitle")}
                  </h5>
                  {user.nid_number && (
                    <div className="mb-3">
                      <strong>{t("profile.nidNumber")}:</strong>{" "}
                      {user.nid_number}
                    </div>
                  )}
                  {user.nid_pic ? (
                    <div className="nid-image-container rounded-4 overflow-hidden border">
                      <ImageWithFallback
                        src={`/uploads/${user.nid_pic}`}
                        className="img-fluid"
                        alt="NID"
                        type="nid"
                      />
                      <div className="overlay-btn">
                        <button
                          className="btn btn-white btn-sm shadow"
                          data-bs-toggle="modal"
                          data-bs-target="#nidModal"
                        >
                          <i className="fas fa-expand-arrows-alt me-2"></i>
                          {t("profile.viewLarge")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-5 bg-light rounded-4">
                      <i className="fas fa-id-card-alt fa-3x mb-3 text-muted opacity-25"></i>
                      <p className="text-muted">
                        {t("profile.nidNotUploaded")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "leaves" && (
          <div className="fade-in">
            <div className="widget-card glass-card p-4">
              <div className="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
                <h5 className="section-title mb-0">
                  <i className="fas fa-history me-2"></i>
                  {t("profile.leaveHistory")}
                </h5>
                <div className="d-flex gap-2">
                  <select
                    className="form-select form-select-sm border-0 bg-light-glass rounded-pill ps-3 pe-5"
                    style={{ minWidth: "140px" }}
                    value={filters.month}
                    onChange={(e) =>
                      setFilters({ ...filters, month: e.target.value })
                    }
                  >
                    <option value="">{t("profile.allMonths")}</option>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {moment(i + 1, "M").format("MMMM")}
                      </option>
                    ))}
                  </select>
                  <select
                    className="form-select form-select-sm border-0 bg-light-glass rounded-pill ps-3 pe-5"
                    style={{ minWidth: "100px" }}
                    value={filters.year}
                    onChange={(e) =>
                      setFilters({ ...filters, year: e.target.value })
                    }
                  >
                    {Array.from({ length: 3 }, (_, i) => {
                      const y = new Date().getFullYear() - i;
                      return (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div className="table-responsive">
                <table className="table custom-table">
                  <thead>
                    <tr>
                      <th>{t("profile.date")}</th>
                      <th>{t("profile.leaveType")}</th>
                      <th>{t("profile.days")}</th>
                      <th>{t("profile.reason")}</th>
                      <th>{t("profile.leaveStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaves.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="text-center py-5 text-muted">
                          {t("profile.noLeaveRecords")}
                        </td>
                      </tr>
                    ) : (
                      leaves.map((leave) => (
                        <tr key={leave.id}>
                          <td>
                            <div className="fw-bold">
                              {moment(leave.start_date).format("DD MMM, YYYY")}
                            </div>
                            <small className="text-muted">
                              {moment(leave.end_date).format("DD MMM, YYYY")}
                            </small>
                          </td>
                          <td>
                            <span className="type-dot me-2"></span>
                            {leave.type_name}
                          </td>
                          <td>
                            <span className="badge bg-light text-dark border px-3">
                              {parseInt(leave.leave_type_id, 10) === 3
                                ? "0.5"
                                : moment(leave.end_date).diff(
                                    moment(leave.start_date),
                                    "days",
                                  ) + 1}{" "}
                              {t("profile.day")}
                            </span>
                          </td>
                          <td
                            className="small text-muted"
                            style={{ maxWidth: "200px" }}
                          >
                            {leave.reason}
                          </td>
                          <td>{getStatusBadge(leave.status)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "security" && canEditOwnProfile && (
          <div className="fade-in">
            <div className="row justify-content-center">
              <div className="col-lg-5 col-md-7">
                <div className="widget-card glass-card p-4">
                  <h5 className="section-title mb-4">
                    <i className="fas fa-lock me-2"></i>পাসওয়ার্ড পরিবর্তন
                  </h5>

                  {pwError && (
                    <div className="alert alert-danger py-2 small rounded-3 mb-3">
                      <i className="fas fa-exclamation-circle me-2"></i>
                      {pwError}
                    </div>
                  )}
                  {pwSuccess && (
                    <div className="alert alert-success py-2 small rounded-3 mb-3">
                      <i className="fas fa-check-circle me-2"></i>
                      {pwSuccess}
                    </div>
                  )}

                  <form onSubmit={handlePasswordChange}>
                    <div className="mb-3">
                      <label className="form-label small fw-bold">
                        বর্তমান পাসওয়ার্ড
                      </label>
                      <input
                        type="password"
                        className="form-control"
                        placeholder="বর্তমান পাসওয়ার্ড দিন"
                        value={pwForm.current}
                        onChange={(e) =>
                          setPwForm({ ...pwForm, current: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label small fw-bold">
                        নতুন পাসওয়ার্ড
                      </label>
                      <input
                        type="password"
                        className="form-control"
                        placeholder="নতুন পাসওয়ার্ড দিন (কমপক্ষে ৪ অক্ষর)"
                        value={pwForm.newPass}
                        onChange={(e) =>
                          setPwForm({ ...pwForm, newPass: e.target.value })
                        }
                        required
                        minLength={4}
                      />
                    </div>
                    <div className="mb-4">
                      <label className="form-label small fw-bold">
                        পাসওয়ার্ড নিশ্চিত করুন
                      </label>
                      <input
                        type="password"
                        className="form-control"
                        placeholder="নতুন পাসওয়ার্ড আবার দিন"
                        value={pwForm.confirm}
                        onChange={(e) =>
                          setPwForm({ ...pwForm, confirm: e.target.value })
                        }
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn btn-primary w-100"
                      disabled={pwLoading}
                    >
                      {pwLoading ? (
                        <>
                          <span
                            className="spinner-border spinner-border-sm me-2"
                            role="status"
                          ></span>
                          পরিবর্তন হচ্ছে...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-save me-2"></i>পাসওয়ার্ড
                          পরিবর্তন করুন
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="modal fade" id="nidModal" tabIndex="-1">
        <div className="modal-dialog modal-lg modal-dialog-centered">
          <div className="modal-content glass-card border-0">
            <div className="modal-header border-0 pb-0">
              <button
                type="button"
                className="btn-close"
                data-bs-dismiss="modal"
              ></button>
            </div>
            <div className="modal-body text-center p-4">
              {user.nid_pic && (
                <img
                  src={`/uploads/${user.nid_pic}`}
                  className="img-fluid rounded-4 shadow"
                  alt="NID Full"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .profile-header-container { position: relative; border-radius: 24px; overflow: hidden; margin-top: -10px; }
        .profile-banner { height: 150px; background: linear-gradient(135deg, #4318ff 0%, #a855f7 100%); opacity: 0.8; }
        .profile-info-overlay { margin: -60px 20px 0; padding: 25px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.4); }
        .profile-avatar-wrapper { position: relative; }
        .profile-avatar { width: 140px; height: 140px; border-radius: 24px; border: 5px solid #fff; object-fit: cover; }
        .status-indicator { position: absolute; bottom: 10px; right: 10px; width: 20px; height: 20px; background: #9ca3af; border: 3px solid #fff; border-radius: 50%; }
        .status-indicator.active { background: #10b981; }

        .user-name { font-size: 2rem; font-weight: 800; color: #1b2559; }
        .user-meta { color: #64748b; font-weight: 500; font-size: 0.95rem; }

        .btn-primary-glass { background: #4318ff; color: #fff; border: none; padding: 10px 24px; border-radius: 12px; font-weight: 600; transition: 0.3s; box-shadow: 0 4px 14px 0 rgba(67, 24, 255, 0.39); }
        .btn-primary-glass:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(67, 24, 255, 0.4); }
        .btn-light-glass { background: rgba(255,255,255,0.8); color: #1b2559; border: 1px solid #e2e8f0; padding: 10px 24px; border-radius: 12px; font-weight: 600; transition: 0.3s; }
        .btn-light-glass:hover { background: #fff; transform: translateY(-2px); }

        .profile-tabs-container .nav-pills .nav-link { color: #64748b; font-weight: 600; padding: 10px 20px; border-radius: 12px; border: none; transition: 0.3s; }
        .profile-tabs-container .nav-pills .nav-link.active { background: #4318ff; color: #fff; box-shadow: 0 4px 12px rgba(67,24,255,0.2); }
        .profile-tabs-container .nav-pills .nav-link:not(.active):hover { background: rgba(67,24,255,0.05); color: #4318ff; }

        .section-title { font-weight: 800; color: #1b2559; font-size: 1.1rem; }
        .stat-label { color: #64748b; font-weight: 600; font-size: 0.85rem; margin-bottom: 5px; }
        .stat-value { font-size: 2.2rem; font-weight: 800; line-height: 1; }

        .bg-primary-soft { background-color: rgba(67, 24, 255, 0.08); }
        .bg-success-soft { background-color: rgba(16, 185, 129, 0.1); }
        .bg-danger-soft { background-color: rgba(239, 68, 68, 0.1); }
        .bg-warning-soft { background-color: rgba(245, 158, 11, 0.1); }

        .contact-item { display: flex; align-items: center; }
        .icon-circle { width: 45px; height: 45px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; }

        .nid-image-container { position: relative; }
        .overlay-btn { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.2); opacity: 0; transition: 0.3s; }
        .nid-image-container:hover .overlay-btn { opacity: 1; }

        .custom-table { margin-bottom: 0; }
        .custom-table thead th { background: #f8fafc; border: none; padding: 15px; color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }
        .custom-table tbody td { border-bottom: 1px solid #f1f5f9; padding: 15px; vertical-align: middle; color: #1b2559; }
        .type-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #4318ff; }

        .fade-in { animation: fadeIn 0.4s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        @media (max-width: 991px) {
          .profile-avatar { width: 100px; height: 100px; }
          .profile-info-overlay { margin-top: -40px; padding: 15px; }
          .user-name { font-size: 1.5rem; }
          .profile-actions { width: 100%; }
          .profile-actions button { flex: 1; font-size: 0.9rem; padding: 8px 15px; }
        }
      `,
        }}
      />
    </>
  );
};

export default Profile;
