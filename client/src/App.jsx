import React, { lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import SessionWarning from "./components/SessionWarning";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import PrivateRoute from "./components/PrivateRoute";
import Layout from "./components/Layout";
import { protectedRouteConfig } from "./routes/routeConfig";
import { t } from "./i18n";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AdminDashboard = lazy(() => import("./components/AdminDashboard"));
const Employees = lazy(() => import("./pages/Employees"));
const MyLeaves = lazy(() => import("./pages/MyLeaves"));
const ManageLeaves = lazy(() => import("./pages/ManageLeaves"));
const ManageEntitlements = lazy(() => import("./pages/ManageEntitlements"));
const ManageMenus = lazy(() => import("./pages/ManageMenus"));
const ManagePermissions = lazy(() => import("./pages/ManagePermissions"));
const Profile = lazy(() => import("./pages/Profile"));
const PhoneDirectory = lazy(() => import("./pages/PhoneDirectory"));
const LeaveReport = lazy(() => import("./pages/LeaveReport"));
const UserDashboard = lazy(() => import("./pages/UserDashboard"));
const ApprovalLetter = lazy(() => import("./pages/ApprovalLetter"));
const Logout = lazy(() => import("./components/Logout"));
const ApplyLeave = lazy(() => import("./components/ApplyLeave"));
const LeaveCalendar = lazy(() => import("./components/LeaveCalendar"));
const EditEmployee = lazy(() => import("./components/EditEmployee"));
const ResellerStatusNoc = lazy(() => import("./pages/ResellerStatusNoc"));
const ResellerList = lazy(() => import("./pages/ResellerList"));
const ResellerProfile = lazy(() => import("./pages/ResellerProfile"));
const TasksEngineer = lazy(() => import("./pages/TasksEngineer"));
const BillingLogs = lazy(() => import("./pages/BillingLogs"));
const RequestBw = lazy(() => import("./pages/RequestBw"));
const RequestsAdmin = lazy(() => import("./pages/RequestsAdmin"));
const MonthlySummary = lazy(() => import("./pages/MonthlySummary"));
const Invoice = lazy(() => import("./pages/Invoice"));
const ViewStaticInvoice = lazy(() => import("./pages/ViewStaticInvoice"));
const AddReseller = lazy(() => import("./pages/AddReseller"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const SystemLogs = lazy(() => import("./pages/SystemLogs"));
const OfficeWorkTracker = lazy(() => import("./pages/OfficeWorkTracker"));
const AssetManagement = lazy(() => import("./pages/AssetManagement"));
const InternetRegistration = lazy(() => import("./pages/InternetRegistration"));
const FreeInternetIds = lazy(() => import("./pages/FreeInternetIds"));

const LoadingSpinner = () => (
  <div className="d-flex justify-content-center align-items-center vh-100">
    <div className="spinner-border text-primary" role="status">
      <span className="visually-hidden">{t("app.loading")}</span>
    </div>
  </div>
);

const UnderConstruction = () => (
  <div className="d-flex flex-column justify-content-center align-items-center vh-100">
    <h2 className="text-warning">
      <i className="fas fa-tools me-2"></i>
      {t("app.underConstructionTitle")}
    </h2>
    <p className="text-muted">{t("app.underConstructionText")}</p>
    <a href="/" className="btn btn-primary mt-3">
      {t("app.backToDashboard")}
    </a>
  </div>
);

const routeElementByKey = {
  Dashboard: <Dashboard />,
  AdminDashboard: <AdminDashboard />,
  Employees: <Employees />,
  EditEmployee: <EditEmployee />,
  MyLeaves: <MyLeaves />,
  ManageLeaves: <ManageLeaves />,
  ManageEntitlements: <ManageEntitlements />,
  ManageMenus: <ManageMenus />,
  ManagePermissions: <ManagePermissions />,
  Profile: <Profile />,
  PhoneDirectory: <PhoneDirectory />,
  LeaveReport: <LeaveReport />,
  UserDashboard: <UserDashboard />,
  ApprovalLetter: <ApprovalLetter />,
  ApplyLeave: <ApplyLeave />,
  LeaveCalendar: <LeaveCalendar />,
  ResellerStatusNoc: <ResellerStatusNoc />,
  ResellerList: <ResellerList />,
  ResellerProfile: <ResellerProfile />,
  TasksEngineer: <TasksEngineer />,
  BillingLogs: <BillingLogs />,
  RequestBw: <RequestBw />,
  RequestsAdmin: <RequestsAdmin />,
  MonthlySummary: <MonthlySummary />,
  Invoice: <Invoice />,
  ViewStaticInvoice: <ViewStaticInvoice />,
  AddReseller: <AddReseller />,
  SystemLogs: <SystemLogs />,
  OfficeWorkTracker: <OfficeWorkTracker />,
  AssetManagement: <AssetManagement />,
  InternetRegistration: <InternetRegistration />,
  FreeInternetIds: <FreeInternetIds />,
  UnderConstruction: <UnderConstruction />,
};

function App() {
  return (
    <ErrorBoundary>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Suspense fallback={<LoadingSpinner />}>
          <SessionWarning />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/logout" element={<Logout />} />
            <Route element={<PrivateRoute />}>
              <Route element={<Layout />}>
                {protectedRouteConfig.map((r) => (
                  <Route
                    key={r.path}
                    path={r.path}
                    element={routeElementByKey[r.key]}
                  />
                ))}
              </Route>
            </Route>

            <Route
              path="*"
              element={
                <div className="d-flex flex-column justify-content-center align-items-center vh-100">
                  <h1 className="display-1 fw-bold text-primary">404</h1>
                  <p className="lead">{t("app.notFoundTitle")}</p>
                  <a href="/" className="btn btn-primary mt-3">
                    {t("app.goHome")}
                  </a>
                </div>
              }
            />
          </Routes>
        </Suspense>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
