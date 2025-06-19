// Financial Dashboard JavaScript
// Handles Clerk authentication, API calls, and UI interactions

let currentUser = null;
let financialData = {};
let transactions = [];
let spendingChart = null;
let trendsChart = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Get Clerk publishable key from the template
        const clerkPublishableKey = window.CLERK_PUBLISHABLE_KEY || 'pk_test_bGFyZ2UtZ2FyLTc4LmNsZXJrLmFjY291bnRzLmRldiQ';
        
        // Initialize Clerk
        const clerk = window.Clerk(clerkPublishableKey);
        await clerk.load();
        
        // Check authentication status
        if (clerk.user) {
            currentUser = clerk.user;
            await initializeDashboard();
        } else {
            // Redirect to login if not authenticated
            window.location.href = '/';
        }
        
        // Set up event listeners
        setupEventListeners();
        
    } catch (error) {
        console.error('Initialization error:', error);
        showNotification('Failed to initialize application', 'error');
    }
});

// Initialize dashboard after authentication
async function initializeDashboard() {
    try {
        // Show loading screen
        document.getElementById('loading-screen').classList.remove('hidden');
        document.getElementById('main-content').classList.add('hidden');
        
        // Update user name in welcome message
        const userName = currentUser.firstName || currentUser.emailAddresses[0].emailAddress.split('@')[0];
        document.getElementById('user-name').textContent = userName;
        
        // Save/update user profile
        await saveUserProfile();
        
        // Load financial data
        await loadFinancialData();
        
        // Load transactions
        await loadTransactions();
        
        // Load financial analysis
        await loadFinancialAnalysis();
        
        // Hide loading screen and show content
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('main-content').classList.remove('hidden');
        
    } catch (error) {
        console.error('Dashboard initialization error:', error);
        document.getElementById('loading-screen').classList.add('hidden');
        showNotification('Failed to load dashboard data', 'error');
    }
}

// Save user profile to backend
async function saveUserProfile() {
    try {
        const response = await fetch('/api/user/profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await currentUser.getToken()}`
            },
            body: JSON.stringify({
                clerk_user_id: currentUser.id,
                email: currentUser.emailAddresses[0].emailAddress,
                first_name: currentUser.firstName || '',
                last_name: currentUser.lastName || ''
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to save user profile');
        }
    } catch (error) {
        console.error('Error saving user profile:', error);
    }
}

// Load financial data from backend
async function loadFinancialData() {
    try {
        const response = await fetch(`/api/financial-data?clerk_user_id=${currentUser.id}`, {
            headers: {
                'Authorization': `Bearer ${await currentUser.getToken()}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.monthly_income !== undefined) {
                financialData = data;
                updateFinancialDisplay();
                populateFinancialForm();
            }
        }
    } catch (error) {
        console.error('Error loading financial data:', error);
    }
}

// Update financial display with loaded data
function updateFinancialDisplay() {
    const monthlyIncome = financialData.monthly_income || 0;
    const monthlyExpenses = financialData.monthly_expenses || 0;
    const currentSavings = financialData.current_savings || 0;
    const investmentAmount = financialData.investment_amount || 0;
    const debtAmount = financialData.debt_amount || 0;
    
    // Update key metrics
    document.getElementById('monthly-income').textContent = formatCurrency(monthlyIncome);
    document.getElementById('monthly-expenses').textContent = formatCurrency(monthlyExpenses);
    document.getElementById('total-savings').textContent = formatCurrency(currentSavings);
    
    // Calculate and display net worth
    const netWorth = currentSavings + investmentAmount - debtAmount;
    document.getElementById('net-worth').textContent = formatCurrency(netWorth);
    
    // Calculate and display financial health score
    const healthScore = calculateFinancialHealthScore();
    document.getElementById('health-score').textContent = Math.round(healthScore);
    document.getElementById('health-score-bar').style.width = `${healthScore}%`;
    
    // Update health score color based on score
    const healthScoreBar = document.getElementById('health-score-bar');
    if (healthScore >= 80) {
        healthScoreBar.className = 'bg-gradient-to-r from-green-500 to-green-600 h-2 rounded-full transition-all duration-500';
    } else if (healthScore >= 60) {
        healthScoreBar.className = 'bg-gradient-to-r from-yellow-500 to-yellow-600 h-2 rounded-full transition-all duration-500';
    } else {
        healthScoreBar.className = 'bg-gradient-to-r from-red-500 to-red-600 h-2 rounded-full transition-all duration-500';
    }
}

// Populate financial form with existing data
function populateFinancialForm() {
    document.getElementById('monthly-income-input').value = financialData.monthly_income || '';
    document.getElementById('monthly-expenses-input').value = financialData.monthly_expenses || '';
    document.getElementById('savings-goal-input').value = financialData.savings_goal || '';
    document.getElementById('current-savings-input').value = financialData.current_savings || '';
    document.getElementById('debt-amount-input').value = financialData.debt_amount || '';
    document.getElementById('investment-amount-input').value = financialData.investment_amount || '';
    document.getElementById('emergency-fund-input').value = financialData.emergency_fund || '';
}

// Load transactions from backend
async function loadTransactions() {
    try {
        const response = await fetch(`/api/transactions?clerk_user_id=${currentUser.id}&limit=10`, {
            headers: {
                'Authorization': `Bearer ${await currentUser.getToken()}`
            }
        });
        
        if (response.ok) {
            transactions = await response.json();
            displayTransactions();
        }
    } catch (error) {
        console.error('Error loading transactions:', error);
    }
}

// Display transactions in the UI
function displayTransactions() {
    const transactionsList = document.getElementById('transactions-list');
    
    if (transactions.length === 0) {
        transactionsList.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <i class="fas fa-receipt text-4xl mb-4"></i>
                <p>No transactions yet. Add your first transaction above!</p>
            </div>
        `;
        return;
    }
    
    transactionsList.innerHTML = transactions.map(transaction => {
        const isIncome = transaction.type === 'income';
        const amountClass = isIncome ? 'text-green-600' : 'text-red-600';
        const icon = isIncome ? 'fa-arrow-up' : 'fa-arrow-down';
        const bgClass = isIncome ? 'bg-green-50' : 'bg-red-50';
        
        return `
            <div class="flex items-center justify-between p-4 ${bgClass} rounded-lg border">
                <div class="flex items-center">
                    <div class="w-10 h-10 rounded-full bg-white flex items-center justify-center mr-4">
                        <i class="fas ${icon} ${amountClass}"></i>
                    </div>
                    <div>
                        <p class="font-semibold text-gray-900">${transaction.description || transaction.category}</p>
                        <p class="text-sm text-gray-600">${transaction.category} • ${formatDate(transaction.date)}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="font-semibold ${amountClass}">
                        ${isIncome ? '+' : '-'}${formatCurrency(Math.abs(transaction.amount))}
                    </p>
                </div>
            </div>
        `;
    }).join('');
}

// Load financial analysis and create charts
async function loadFinancialAnalysis() {
    try {
        const response = await fetch(`/api/financial-analysis?clerk_user_id=${currentUser.id}`, {
            headers: {
                'Authorization': `Bearer ${await currentUser.getToken()}`
            }
        });
        
        if (response.ok) {
            const analysis = await response.json();
            createCharts(analysis);
        }
    } catch (error) {
        console.error('Error loading financial analysis:', error);
        createDefaultCharts();
    }
}

// Create charts with analysis data
function createCharts(analysis) {
    // Spending by Category Chart
    const spendingCtx = document.getElementById('spending-chart').getContext('2d');
    const spendingData = analysis.spending_by_category || [];
    
    if (spendingChart) {
        spendingChart.destroy();
    }
    
    spendingChart = new Chart(spendingCtx, {
        type: 'doughnut',
        data: {
            labels: spendingData.map(item => item.category.charAt(0).toUpperCase() + item.category.slice(1)),
            datasets: [{
                data: spendingData.map(item => item.amount),
                backgroundColor: [
                    '#4F46E5', '#7C3AED', '#EC4899', '#EF4444',
                    '#F59E0B', '#10B981', '#06B6D4', '#8B5CF6'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true
                    }
                }
            }
        }
    });
    
    // Monthly Trends Chart
    const trendsCtx = document.getElementById('trends-chart').getContext('2d');
    const trendsData = analysis.monthly_trends || [];
    
    if (trendsChart) {
        trendsChart.destroy();
    }
    
    trendsChart = new Chart(trendsCtx, {
        type: 'line',
        data: {
            labels: trendsData.map(item => {
                const date = new Date(item.month + '-01');
                return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            }),
            datasets: [{
                label: 'Income',
                data: trendsData.map(item => item.income),
                borderColor: '#10B981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.4,
                fill: true
            }, {
                label: 'Expenses',
                data: trendsData.map(item => item.expenses),
                borderColor: '#EF4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

// Create default charts when no data available
function createDefaultCharts() {
    const spendingCtx = document.getElementById('spending-chart').getContext('2d');
    const trendsCtx = document.getElementById('trends-chart').getContext('2d');
    
    // Default spending chart
    spendingChart = new Chart(spendingCtx, {
        type: 'doughnut',
        data: {
            labels: ['No Data'],
            datasets: [{
                data: [1],
                backgroundColor: ['#E5E7EB'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
    
    // Default trends chart
    trendsChart = new Chart(trendsCtx, {
        type: 'line',
        data: {
            labels: ['No Data'],
            datasets: [{
                label: 'No Data Available',
                data: [0],
                borderColor: '#E5E7EB',
                backgroundColor: 'rgba(229, 231, 235, 0.1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

// Set up event listeners
function setupEventListeners() {
    // Financial form submission
    document.getElementById('financial-form').addEventListener('submit', handleFinancialFormSubmit);
    
    // Transaction form submission
    document.getElementById('transaction-form').addEventListener('submit', handleTransactionFormSubmit);
    
    // AI advice button
    document.getElementById('ai-advice-btn').addEventListener('click', showAIAdviceModal);
    
    // Modal close button
    document.getElementById('close-modal').addEventListener('click', closeAIModal);
    
    // Close modal on outside click
    document.getElementById('ai-modal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeAIModal();
        }
    });
}

// Handle financial form submission
async function handleFinancialFormSubmit(e) {
    e.preventDefault();
    
    try {
        const formData = {
            clerk_user_id: currentUser.id,
            monthly_income: parseFloat(document.getElementById('monthly-income-input').value) || 0,
            monthly_expenses: parseFloat(document.getElementById('monthly-expenses-input').value) || 0,
            savings_goal: parseFloat(document.getElementById('savings-goal-input').value) || 0,
            current_savings: parseFloat(document.getElementById('current-savings-input').value) || 0,
            debt_amount: parseFloat(document.getElementById('debt-amount-input').value) || 0,
            investment_amount: parseFloat(document.getElementById('investment-amount-input').value) || 0,
            emergency_fund: parseFloat(document.getElementById('emergency-fund-input').value) || 0
        };
        
        const response = await fetch('/api/financial-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await currentUser.getToken()}`
            },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            financialData = formData;
            updateFinancialDisplay();
            await loadFinancialAnalysis();
            showNotification('Financial data updated successfully!', 'success');
        } else {
            throw new Error('Failed to save financial data');
        }
    } catch (error) {
        console.error('Error saving financial data:', error);
        showNotification('Failed to save financial data', 'error');
    }
}

// Handle transaction form submission
async function handleTransactionFormSubmit(e) {
    e.preventDefault();
    
    try {
        const transactionData = {
            clerk_user_id: currentUser.id,
            type: document.getElementById('transaction-type').value,
            category: document.getElementById('transaction-category').value,
            amount: parseFloat(document.getElementById('transaction-amount').value),
            description: document.getElementById('transaction-description').value,
            date: new Date().toISOString().split('T')[0]
        };
        
        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await currentUser.getToken()}`
            },
            body: JSON.stringify(transactionData)
        });
        
        if (response.ok) {
            // Reset form
            document.getElementById('transaction-form').reset();
            
            // Reload transactions and analysis
            await loadTransactions();
            await loadFinancialAnalysis();
            
            showNotification('Transaction added successfully!', 'success');
        } else {
            throw new Error('Failed to add transaction');
        }
    } catch (error) {
        console.error('Error adding transaction:', error);
        showNotification('Failed to add transaction', 'error');
    }
}

// Show AI advice modal
async function showAIAdviceModal() {
    const modal = document.getElementById('ai-modal');
    const loadingDiv = document.getElementById('ai-advice-loading');
    const contentDiv = document.getElementById('ai-advice-content');
    
    modal.classList.remove('hidden');
    loadingDiv.classList.remove('hidden');
    contentDiv.classList.add('hidden');
    
    try {
        const response = await fetch('/api/ai-advice', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await currentUser.getToken()}`
            },
            body: JSON.stringify({
                clerk_user_id: currentUser.id
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            displayAIAdvice(data);
        } else {
            throw new Error('Failed to get AI advice');
        }
    } catch (error) {
        console.error('Error getting AI advice:', error);
        displayAIAdviceError();
    }
}

// Display AI advice in modal
function displayAIAdvice(data) {
    const loadingDiv = document.getElementById('ai-advice-loading');
    const contentDiv = document.getElementById('ai-advice-content');
    const adviceText = document.getElementById('advice-text');
    
    // Format the AI advice text with better styling
    const formattedAdvice = formatAIAdvice(data.advice);
    adviceText.innerHTML = formattedAdvice;
    
    // Update financial summary
    const summary = data.financial_summary;
    document.getElementById('savings-rate').textContent = `${summary.savings_rate}%`;
    document.getElementById('net-income-summary').textContent = formatCurrency(summary.net_income);
    document.getElementById('debt-ratio').textContent = `${(summary.debt_to_income_ratio * 100).toFixed(1)}%`;
    
    loadingDiv.classList.add('hidden');
    contentDiv.classList.remove('hidden');
}

// Format AI advice text for better display
function formatAIAdvice(advice) {
    // Convert numbered lists and sections to HTML
    let formatted = advice
        .replace(/(\d+\.\s)/g, '<h4 class="font-semibold text-indigo-600 mt-4 mb-2">$1')
        .replace(/([A-Z][^:\n]*:)/g, '<h3 class="font-bold text-gray-800 mt-6 mb-3 text-lg">$1</h3>')
        .replace(/\n\n/g, '</p><p class="mb-3">')
        .replace(/\n/g, '<br>');
    
    // Wrap in paragraph tags
    formatted = '<p class="mb-3">' + formatted + '</p>';
    
    // Add bullet points styling
    formatted = formatted.replace(/•/g, '<span class="text-indigo-500">•</span>');
    
    // Add emphasis to currency amounts
    formatted = formatted.replace(/\$[\d,]+\.?\d*/g, '<span class="font-semibold text-green-600">$&</span>');
    
    return formatted;
}

// Display AI advice error
function displayAIAdviceError() {
    const loadingDiv = document.getElementById('ai-advice-loading');
    const contentDiv = document.getElementById('ai-advice-content');
    const adviceText = document.getElementById('advice-text');
    
    adviceText.innerHTML = `
        <div class="text-center py-8">
            <i class="fas fa-exclamation-triangle text-4xl text-yellow-500 mb-4"></i>
            <h3 class="text-lg font-semibold mb-2">Unable to Generate Advice</h3>
            <p class="text-gray-600">Please make sure you have entered your financial data and try again.</p>
        </div>
    `;
    
    loadingDiv.classList.add('hidden');
    contentDiv.classList.remove('hidden');
}

// Close AI modal
function closeAIModal() {
    document.getElementById('ai-modal').classList.add('hidden');
}

// Calculate financial health score
function calculateFinancialHealthScore() {
    const monthlyIncome = financialData.monthly_income || 0;
    const monthlyExpenses = financialData.monthly_expenses || 0;
    const currentSavings = financialData.current_savings || 0;
    const debtAmount = financialData.debt_amount || 0;
    const emergencyFund = financialData.emergency_fund || 0;
    
    let score = 0;
    
    if (monthlyIncome > 0) {
        // Savings rate (max 30 points)
        const savingsRate = ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100;
        score += Math.min(30, savingsRate * 1.5);
        
        // Emergency fund (max 25 points)
        if (monthlyExpenses > 0) {
            const emergencyMonths = emergencyFund / monthlyExpenses;
            score += Math.min(25, emergencyMonths * 4);
        }
        
        // Debt-to-income ratio (max 25 points)
        const debtRatio = debtAmount / monthlyIncome;
        if (debtRatio <= 0.1) {
            score += 25;
        } else if (debtRatio <= 0.3) {
            score += 15;
        } else if (debtRatio <= 0.5) {
            score += 10;
        }
        
        // Having savings (max 20 points)
        if (currentSavings > 0) {
            score += Math.min(20, (currentSavings / monthlyIncome) * 2);
        }
    }
    
    return Math.min(100, Math.max(0, score));
}

// Utility functions
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg transition-all duration-300 transform translate-x-full ${
        type === 'success' ? 'bg-green-500 text-white' :
        type === 'error' ? 'bg-red-500 text-white' :
        'bg-blue-500 text-white'
    }`;
    
    notification.innerHTML = `
        <div class="flex items-center">
            <i class="fas ${
                type === 'success' ? 'fa-check-circle' :
                type === 'error' ? 'fa-exclamation-circle' :
                'fa-info-circle'
            } mr-2"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.classList.remove('translate-x-full');
    }, 100);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.classList.add('translate-x-full');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Initialize charts on page load
window.addEventListener('load', function() {
    // Initialize Chart.js defaults
    Chart.defaults.font.family = 'Inter, sans-serif';
    Chart.defaults.color = '#6B7280';
});

// Handle window resize for responsive charts
window.addEventListener('resize', function() {
    if (spendingChart) {
        spendingChart.resize();
    }
    if (trendsChart) {
        trendsChart.resize();
    }
});