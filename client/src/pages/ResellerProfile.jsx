import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend } from 'chart.js';

// Custom hooks
import { useResellerProfile } from '../hooks/useResellerProfile';
import { useChannelPartner } from '../hooks/useChannelPartner';

// Core components
import ProfileHeader from '../components/ResellerProfile/ProfileHeader';
import ProfileStats from '../components/ResellerProfile/ProfileStats';
import ProfileDetails from '../components/ResellerProfile/ProfileDetails';

// Tab components
import BandwidthTab from '../components/ResellerProfile/Tabs/BandwidthTab';
import StatementTab from '../components/ResellerProfile/Tabs/StatementTab';
import RequestsTab from '../components/ResellerProfile/Tabs/RequestsTab';

// Channel Partner components
import UsersTab from '../components/ResellerProfile/ChannelPartner/UsersTab';
import CollectionTab from '../components/ResellerProfile/ChannelPartner/CollectionTab';
import CommissionTab from '../components/ResellerProfile/ChannelPartner/CommissionTab';
import CPStatementTab from '../components/ResellerProfile/ChannelPartner/CPStatementTab';

// Modal components
import PaymentModal from '../components/ResellerProfile/Modals/PaymentModal';
import DiscountModal from '../components/ResellerProfile/Modals/DiscountModal';
import EditProfileModal from '../components/ResellerProfile/Modals/EditProfileModal';
import RateChangeModal from '../components/ResellerProfile/Modals/RateChangeModal';
import BillHistoryModal from '../components/ResellerProfile/Modals/BillHistoryModal';
import AddUserModal from '../components/ResellerProfile/Modals/AddUserModal';
import EditUserModal from '../components/ResellerProfile/Modals/EditUserModal';
import CommissionPaymentModal from '../components/ResellerProfile/Modals/CommissionPaymentModal';
import AdjustmentModal from '../components/ResellerProfile/Modals/AdjustmentModal';
import ImportModal from '../components/ResellerProfile/Modals/ImportModal';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const ResellerProfile = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const profileId = id || searchParams.get('id');

  const [activeTab, setActiveTab] = useState('bandwidth');

  // Use custom hooks
  const {
    data,
    loadError,
    saving,
    load,
    showPay, setShowPay,
    showDiscount, setShowDiscount,
    showEdit, setShowEdit,
    showBillHistory, setShowBillHistory,
    showRateChange, setShowRateChange,
    paymentAmount, setPaymentAmount,
    paymentDate, setPaymentDate,
    paymentMethod, setPaymentMethod,
    paymentNote, setPaymentNote,
    submitPayment,
    discountAmount, setDiscountAmount,
    discountDate, setDiscountDate,
    discountNote, setDiscountNote,
    submitDiscount,
    editForm, setEditForm,
    saveProfile,
    rateChangeForm, setRateChangeForm,
    rateChangeSaving,
    rateChangeLogs,
    openRateChangeModal,
    submitRateChange
  } = useResellerProfile(profileId);

  const isChannel = data?.reseller?.partner_type === 'channel_partner';

  const {
    cpUsers,
    cpMonth, setCpMonth,
    cpUserPayments,
    cpCommission,
    cpHistory,
    cpStatement,
    cpUserSearch, setCpUserSearch,
    loadChannelData,
    loadUserPayments,
    showAddUser, setShowAddUser,
    showEditUser, setShowEditUser,
    showCommissionPay, setShowCommissionPay,
    showAdjust, setShowAdjust,
    showImport, setShowImport,
    newUser, setNewUser,
    commPayForm, setCommPayForm,
    adjForm, setAdjForm,
    importing,
    importFile, setImportFile,
    importMonth, setImportMonth,
    handleAddUser,
    handleEditUser,
    handleDeleteUser,
    handleInitPayments,
    handleRecordPayment,
    handleBulkFullPaid,
    handleGenerateCommission,
    handleCommissionPayment,
    handleAdjustment,
    handleFinalize,
    handleImport
  } = useChannelPartner(profileId, isChannel);

  // Auto-switch tab for channel partners
  useEffect(() => {
    if (data && data.reseller?.partner_type === 'channel_partner' && activeTab === 'bandwidth') {
      setActiveTab(data.permissions?.can_view_financials ? 'cp_users' : 'requests');
    }
  }, [data, activeTab]);

  if (loadError) return <div className="p-4 text-danger">{loadError}</div>;
  if (!data) return <div className="p-4">লোড হচ্ছে...</div>;

  const can = data?.permissions || {};
  const reseller = data?.reseller || {};
  const stats = data?.stats || {};
  const requests = data?.recent_requests || [];
  const statementItems = data?.statement_items || [];
  const billHistory = data?.bill_history || [];

  return (
    <div className="container-fluid py-3 reseller-page">
      {stats.pending_bill_warning && (
        <div className="alert alert-warning border-0 shadow-sm mb-3">
          <i className="fas fa-exclamation-triangle text-warning me-2" />
          {stats.pending_bill_warning}
        </div>
      )}

      <ProfileHeader
        reseller={reseller}
        can={can}
        onPaymentClick={() => setShowPay(true)}
        onDiscountClick={() => setShowDiscount(true)}
      />

      <ProfileStats
        isChannel={isChannel}
        can={can}
        stats={stats}
        reseller={reseller}
        cpCommission={cpCommission}
        onBillHistoryClick={() => setShowBillHistory(true)}
      />

      <div className="row g-3">
        <div className="col-lg-4">
          <ProfileDetails
            reseller={reseller}
            can={can}
            onEditClick={() => setShowEdit(true)}
          />
        </div>

        <div className="col-lg-8">
          <div className="card">
            <div className="card-header border-0 bg-transparent p-3 d-flex justify-content-between align-items-center">
              <ul className="nav nav-pills card-header-pills flex-wrap">
                {reseller.partner_type !== 'channel_partner' && (
                  <li className="nav-item">
                    <button
                      className={`nav-link btn-sm py-1 px-3 ${activeTab === 'bandwidth' ? 'active' : ''}`}
                      onClick={() => setActiveTab('bandwidth')}
                    >
                      Bandwidth
                    </button>
                  </li>
                )}
                {isChannel && (
                  <li className="nav-item">
                    <button
                      className={`nav-link btn-sm py-1 px-3 ${activeTab === 'cp_users' ? 'active' : ''}`}
                      onClick={() => setActiveTab('cp_users')}
                    >
                      ইউজার
                    </button>
                  </li>
                )}
                {isChannel && can.can_view_financials && (
                  <li className="nav-item">
                    <button
                      className={`nav-link btn-sm py-1 px-3 ${activeTab === 'cp_collection' ? 'active' : ''}`}
                      onClick={() => setActiveTab('cp_collection')}
                    >
                      কালেকশন
                    </button>
                  </li>
                )}
                {isChannel && can.can_view_financials && (
                  <li className="nav-item">
                    <button
                      className={`nav-link btn-sm py-1 px-3 ${activeTab === 'cp_commission' ? 'active' : ''}`}
                      onClick={() => setActiveTab('cp_commission')}
                    >
                      কমিশন
                    </button>
                  </li>
                )}
                {isChannel && can.can_view_financials && (
                  <li className="nav-item">
                    <button
                      className={`nav-link btn-sm py-1 px-3 ${activeTab === 'cp_statement' ? 'active' : ''}`}
                      onClick={() => setActiveTab('cp_statement')}
                    >
                      স্টেটমেন্ট
                    </button>
                  </li>
                )}
                {!isChannel && can.can_view_financials && (
                  <li className="nav-item">
                    <button
                      className={`nav-link btn-sm py-1 px-3 ${activeTab === 'statement' ? 'active' : ''}`}
                      onClick={() => setActiveTab('statement')}
                    >
                      Statement
                    </button>
                  </li>
                )}
                <li className="nav-item">
                  <button
                    className={`nav-link btn-sm py-1 px-3 ${activeTab === 'requests' ? 'active' : ''}`}
                    onClick={() => setActiveTab('requests')}
                  >
                    Requests
                  </button>
                </li>
              </ul>
              {can.can_view_financials && (
                <Link to={`/billing-logs?reseller_id=${reseller.id}`} className="btn btn-xs btn-outline-primary rounded-pill px-2" style={{ fontSize: 11 }}>
                  View All
                </Link>
              )}
            </div>

            <div className="card-body p-0">
              {activeTab === 'bandwidth' && (
                <BandwidthTab
                  reseller={reseller}
                  can={can}
                  rateChangeLogs={rateChangeLogs}
                  onRateChangeClick={openRateChangeModal}
                />
              )}

              {activeTab === 'statement' && can.can_view_financials && (
                <StatementTab statementItems={statementItems} />
              )}

              {activeTab === 'cp_users' && isChannel && (
                <UsersTab
                  cpUsers={cpUsers}
                  cpUserSearch={cpUserSearch}
                  setCpUserSearch={setCpUserSearch}
                  onAddUser={() => {
                    setNewUser({ user_name: '', user_id_code: '', phone: '', package_name: '', monthly_rate: '' });
                    setShowAddUser(true);
                  }}
                  onEditUser={(user) => setShowEditUser(user)}
                  onDeleteUser={handleDeleteUser}
                />
              )}

              {activeTab === 'cp_collection' && isChannel && (
                <CollectionTab
                  cpUserPayments={cpUserPayments}
                  cpMonth={cpMonth}
                  setCpMonth={setCpMonth}
                  onInitPayments={handleInitPayments}
                  onRecordPayment={handleRecordPayment}
                  onBulkFullPaid={handleBulkFullPaid}
                  onImportClick={() => setShowImport(true)}
                />
              )}

              {activeTab === 'cp_commission' && isChannel && (
                <CommissionTab
                  cpHistory={cpHistory}
                  onGenerateCommission={handleGenerateCommission}
                  onCommissionPayment={() => {
                    setCommPayForm({ amount: '', payment_date: paymentDate, payment_method: 'Cash', reference_no: '', note: '' });
                    setShowCommissionPay(true);
                  }}
                  onAdjustment={(log) => {
                    setAdjForm({ type: 'adjustment', amount: '', note: '' });
                    setShowAdjust(log);
                  }}
                  onFinalize={handleFinalize}
                  onDownloadReport={handleDownloadReport}
                />
              )}

              {activeTab === 'cp_statement' && isChannel && (
                <CPStatementTab cpStatement={cpStatement} />
              )}

              {activeTab === 'requests' && (
                <RequestsTab requests={requests} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showPay && (
        <PaymentModal
          paymentAmount={paymentAmount}
          setPaymentAmount={setPaymentAmount}
          paymentDate={paymentDate}
          setPaymentDate={setPaymentDate}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          paymentNote={paymentNote}
          setPaymentNote={setPaymentNote}
          onSubmit={submitPayment}
          onClose={() => setShowPay(false)}
        />
      )}

      {showDiscount && (
        <DiscountModal
          discountAmount={discountAmount}
          setDiscountAmount={setDiscountAmount}
          discountDate={discountDate}
          setDiscountDate={setDiscountDate}
          discountNote={discountNote}
          setDiscountNote={setDiscountNote}
          onSubmit={submitDiscount}
          onClose={() => setShowDiscount(false)}
        />
      )}

      {showEdit && (
        <EditProfileModal
          editForm={editForm}
          setEditForm={setEditForm}
          saving={saving}
          onSubmit={saveProfile}
          onClose={() => setShowEdit(false)}
        />
      )}

      {showRateChange && (
        <RateChangeModal
          reseller={reseller}
          rateChangeForm={rateChangeForm}
          setRateChangeForm={setRateChangeForm}
          rateChangeSaving={rateChangeSaving}
          onSubmit={submitRateChange}
          onClose={() => setShowRateChange(false)}
        />
      )}

      {showBillHistory && can.can_view_financials && (
        <BillHistoryModal
          billHistory={billHistory}
          onClose={() => setShowBillHistory(false)}
        />
      )}

      {showAddUser && (
        <AddUserModal
          newUser={newUser}
          setNewUser={setNewUser}
          onSubmit={handleAddUser}
          onClose={() => setShowAddUser(false)}
        />
      )}

      {showEditUser && (
        <EditUserModal
          showEditUser={showEditUser}
          setShowEditUser={setShowEditUser}
          onSubmit={handleEditUser}
          onClose={() => setShowEditUser(null)}
        />
      )}

      {showCommissionPay && (
        <CommissionPaymentModal
          cpCommission={cpCommission}
          commPayForm={commPayForm}
          setCommPayForm={setCommPayForm}
          onSubmit={handleCommissionPayment}
          onClose={() => setShowCommissionPay(false)}
        />
      )}

      {showAdjust && (
        <AdjustmentModal
          adjForm={adjForm}
          setAdjForm={setAdjForm}
          onSubmit={handleAdjustment}
          onClose={() => setShowAdjust(false)}
        />
      )}

      {showImport && (
        <ImportModal
          importMonth={importMonth}
          setImportMonth={setImportMonth}
          importFile={importFile}
          setImportFile={setImportFile}
          importing={importing}
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
};

export default ResellerProfile;
