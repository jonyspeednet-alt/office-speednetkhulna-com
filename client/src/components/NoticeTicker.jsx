import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getNotice } from '../services/noticeService';
import '../styles/NoticeTicker.css';

const NoticeTicker = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['activeNotice'],
    queryFn: getNotice,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  if (isLoading || error || !data?.notice) return null;

  const notice = data.notice;

  return (
    <div className="news-ticker">
      <div className="ticker-title">
        <i className="fas fa-bullhorn me-2"></i> সর্বশেষ আপডেট
      </div>
      <div className="ticker-content">
        {/* CSS Animation replaces <marquee> */}
        <div className="ticker-scroll">
          {notice}
        </div>
      </div>
    </div>
  );
};

export default NoticeTicker;
