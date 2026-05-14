import React from 'react';
import ModalWrap from '../ModalWrap';

const ImportModal = ({
    importMonth,
    setImportMonth,
    importFile,
    setImportFile,
    importing,
    onImport,
    onClose
}) => {
    return (
        <ModalWrap title="Excel ডাটা ইম্পোর্ট করুন" onClose={() => { if (!importing) onClose(); }}>
            <div className="p-2">
                <div className="alert alert-info py-2 small mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                        <span>
                            <i className="fas fa-info-circle me-2" />
                            Excel ফাইলে অবশ্যই <strong>&quot;Customer Name&quot;</strong> এবং <strong>&quot;Receive Amount&quot;</strong> কলাম থাকতে হবে।
                        </span>
                        <button 
                            className="btn btn-xs btn-link p-0 text-decoration-none fw-bold" 
                            style={{ fontSize: '0.75rem' }}
                            onClick={() => import('../../../utils/excelGenerator').then(m => m.downloadUserImportSample())}
                        >
                            <i className="fas fa-download me-1" />Sample
                        </button>
                    </div>
                </div>
                <div className="mb-3">
                    <label className="form-label small">মাস নির্বাচন করুন</label>
                    <input
                        type="month"
                        className="form-control form-control-sm"
                        value={importMonth}
                        onChange={e => setImportMonth(e.target.value)}
                        disabled={importing}
                    />
                </div>
                <div className="mb-3">
                    <label className="form-label small">Excel ফাইল আপলোড করুন (.xlsx, .xls)</label>
                    <input
                        type="file"
                        className="form-control form-control-sm"
                        accept=".xlsx, .xls"
                        onChange={e => setImportFile(e.target.files[0])}
                        disabled={importing}
                    />
                </div>
                <div className="text-end pt-2">
                    <button
                        className="btn btn-sm btn-light me-2 rounded-pill px-3"
                        onClick={onClose}
                        disabled={importing}
                    >
                        বাতিল
                    </button>
                    <button
                        className="btn btn-sm btn-primary rounded-pill px-4"
                        disabled={importing || !importFile}
                        onClick={onImport}
                    >
                        {importing ? (
                            <><span className="spinner-border spinner-border-sm me-2" />প্রসেস হচ্ছে...</>
                        ) : (
                            <><i className="fas fa-upload me-1" />ইম্পোর্ট শুরু করুন</>
                        )}
                    </button>
                </div>
            </div>
        </ModalWrap>
    );
};

export default ImportModal;
