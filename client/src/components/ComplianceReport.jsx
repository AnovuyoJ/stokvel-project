import { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';

function authHeader() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const token = user.token || user.accessToken || user.user?.token;
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

const API = import.meta.env.VITE_API_URL;

const ComplianceReportPage = () => {
  const { groupId } = useParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await axios.get(`${API}/api/groups/${groupId}/compliance-report`, {
          headers: authHeader()
        });
        setData(res.data);
      } catch (err) {
        console.error(err);
        setError(err.response?.data?.error || 'Failed to load report');
        if (err.response?.status === 401 || err.response?.status === 403) {
          navigate('/login');
        }
      } finally {
        setLoading(false);
      }
    };
    if (groupId) fetchReport();
  }, [groupId, navigate]);

  const exportCSV = () => {
    if (!data) return;
    const { months, report } = data;
    const headers = ['Member', 'Email', 'Role', ...months, 'Total Expected', 'Total Paid', 'Missed', 'Compliance %'];
    const rows = report.map(m => {
      const monthStatuses = months.map(month => {
        const statusObj = m.monthStatuses.find(ms => ms.month === month);
        return statusObj ? statusObj.status : 'missed';
      });
      return [
        m.name, m.email, m.role,
        ...monthStatuses,
        m.totalExpected, m.totalPaid, m.missedCount,
        `${m.compliancePercentage}%`
      ];
    });
    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance_${data.groupName}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#f0eeff' }}>Loading compliance report...</div>;
  if (error) return <div style={{ padding: '2rem', color: '#e05c5c', textAlign: 'center' }}>{error}</div>;
  if (!data) return null;

  const { groupName, months, report } = data;

  return (
    <div style={{ padding: '2rem', color: 'var(--text, #f0eeff)', background: 'var(--bg, #0e0c14)', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1>Compliance Report – {groupName}</h1>
        <button onClick={exportCSV} style={{ background: '#28a745', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>
          Export CSV
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--surface, #131929)', borderRadius: '12px', overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: 'var(--surface2, #1a2238)' }}>
              <th style={{ padding: '12px', textAlign: 'left' }}>Member</th>
              <th style={{ padding: '12px', textAlign: 'left' }}>Email</th>
              <th style={{ padding: '12px', textAlign: 'left' }}>Role</th>
              {months.map(month => <th key={month} style={{ padding: '12px', textAlign: 'center' }}>{month}</th>)}
              <th style={{ padding: '12px', textAlign: 'center' }}>Expected</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>Paid</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>Missed</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>Compliance</th>
            </tr>
          </thead>
          <tbody>
            {report.map(member => (
              <tr key={member.memberId} style={{ borderBottom: '1px solid var(--border, #252d45)' }}>
                <td style={{ padding: '12px' }}>{member.name}</td>
                <td style={{ padding: '12px' }}>{member.email}</td>
                <td style={{ padding: '12px' }}>{member.role}</td>
                {months.map(month => {
                  const statusObj = member.monthStatuses.find(ms => ms.month === month);
                  const status = statusObj ? statusObj.status : 'missed';
                  return (
                    <td key={month} style={{ padding: '12px', textAlign: 'center', color: status === 'paid' ? '#4caf7d' : '#e05c5c' }}>
                      {status === 'paid' ? '✅' : status === 'missed' ? '❌' : '⏳'}
                    </td>
                  );
                })}
                <td style={{ padding: '12px', textAlign: 'center' }}>{member.totalExpected}</td>
                <td style={{ padding: '12px', textAlign: 'center' }}>{member.totalPaid}</td>
                <td style={{ padding: '12px', textAlign: 'center' }}>{member.missedCount}</td>
                <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: member.compliancePercentage >= 80 ? '#4caf7d' : '#e05c5c' }}>
                  {member.compliancePercentage}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ComplianceReportPage;