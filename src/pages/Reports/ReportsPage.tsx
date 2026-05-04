import { useState } from 'react';
import SalesEndOfDayPage from './SalesEndOfDayPage';
import ProductReportPage from './ProductReportPage';
import './SalesEndOfDayPage.css';

type ReportTab = 'sales' | 'products';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>('sales');

  return (
    <div>
      <div className="reports-tab-bar">
        <button
          type="button"
          className={`reports-tab-btn${activeTab === 'sales' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('sales')}
        >
          Báo cáo bán hàng
        </button>
        <button
          type="button"
          className={`reports-tab-btn${activeTab === 'products' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('products')}
        >
          Báo cáo hàng hóa
        </button>
      </div>

      {activeTab === 'sales' && <SalesEndOfDayPage />}
      {activeTab === 'products' && <ProductReportPage />}
    </div>
  );
}
