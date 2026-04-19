import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search } from 'lucide-react';

function DataTable({ 
  data = [], 
  columns = [], 
  searchable = true, 
  searchPlaceholder = 'Search...',
  onRowClick,
  pagination = true,
  itemsPerPage = 10 
}) {
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Filter data based on search
  const filteredData = search ? data.filter(item => {
    return columns.some(col => {
      const value = col.accessor ? item[col.accessor] : '';
      return String(value).toLowerCase().includes(search.toLowerCase());
    });
  }) : data;

  // Pagination
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = pagination 
    ? filteredData.slice(startIndex, startIndex + itemsPerPage)
    : filteredData;

  return (
    <div className="data-table-container">
      {searchable && (
        <div className="data-table-search">
          <Search size={20} />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
      )}
      
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col, idx) => (
                <th key={idx} style={{ width: col.width }}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length > 0 ? (
              paginatedData.map((row, idx) => (
                <tr 
                  key={idx} 
                  onClick={() => onRowClick && onRowClick(row)}
                  className={onRowClick ? 'clickable' : ''}
                >
                  {columns.map((col, colIdx) => (
                    <td key={colIdx}>
                      {col.render ? col.render(row) : row[col.accessor]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: '40px' }}>
                  No data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination && totalPages > 1 && (
        <div className="data-table-pagination">
          <div className="pagination-info">
            Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredData.length)} of {filteredData.length} entries
          </div>
          <div className="pagination-controls">
            <button 
              onClick={() => setCurrentPage(1)} 
              disabled={currentPage === 1}
              title="First page"
            >
              <ChevronsLeft size={18} />
            </button>
            <button 
              onClick={() => setCurrentPage(p => p - 1)} 
              disabled={currentPage === 1}
              title="Previous page"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="page-numbers">
              Page {currentPage} of {totalPages}
            </span>
            <button 
              onClick={() => setCurrentPage(p => p + 1)} 
              disabled={currentPage === totalPages}
              title="Next page"
            >
              <ChevronRight size={18} />
            </button>
            <button 
              onClick={() => setCurrentPage(totalPages)} 
              disabled={currentPage === totalPages}
              title="Last page"
            >
              <ChevronsRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataTable;
