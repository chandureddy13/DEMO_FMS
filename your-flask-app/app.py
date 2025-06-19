from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import os
from dotenv import load_dotenv
import requests
import json
from datetime import datetime, timedelta
import sqlite3
from groq import Groq
import jwt
from functools import wraps

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'your-secret-key-here')

# Clerk configuration
CLERK_SECRET_KEY = os.environ.get('CLERK_SECRET_KEY')
CLERK_PUBLISHABLE_KEY = os.environ.get('CLERK_PUBLISHABLE_KEY')
CLERK_FRONTEND_API = os.environ.get('CLERK_FRONTEND_API')

# Groq AI configuration
GROQ_API_KEY = os.environ.get('GROQ_API_KEY')
groq_client = Groq(api_key=GROQ_API_KEY)

# Database initialization
def init_db():
    conn = sqlite3.connect('financial_data.db')
    cursor = conn.cursor()
    
    # Users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clerk_user_id TEXT UNIQUE NOT NULL,
            email TEXT NOT NULL,
            first_name TEXT,
            last_name TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Financial data table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS financial_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            monthly_income REAL,
            monthly_expenses REAL,
            savings_goal REAL,
            current_savings REAL,
            debt_amount REAL,
            investment_amount REAL,
            emergency_fund REAL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Transactions table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            type TEXT NOT NULL,
            category TEXT NOT NULL,
            amount REAL NOT NULL,
            description TEXT,
            date DATE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Goals table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            goal_type TEXT NOT NULL,
            target_amount REAL NOT NULL,
            current_amount REAL DEFAULT 0,
            target_date DATE,
            description TEXT,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    conn.commit()
    conn.close()

# Clerk authentication decorator
def clerk_auth_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'error': 'No token provided'}), 401
        
        try:
            token = token.replace('Bearer ', '')
            # Verify token with Clerk
            headers = {
                'Authorization': f'Bearer {CLERK_SECRET_KEY}',
                'Content-Type': 'application/json'
            }
            response = requests.get(
                f'https://api.clerk.dev/v1/sessions/{token}/verify',
                headers=headers
            )
            
            if response.status_code == 200:
                session_data = response.json()
                request.clerk_user = session_data
                return f(*args, **kwargs)
            else:
                return jsonify({'error': 'Invalid token'}), 401
                
        except Exception as e:
            return jsonify({'error': 'Token verification failed'}), 401
    
    return decorated_function

# Helper function to get user from database
def get_or_create_user(clerk_user_id, email, first_name='', last_name=''):
    conn = sqlite3.connect('financial_data.db')
    cursor = conn.cursor()
    
    cursor.execute('SELECT id FROM users WHERE clerk_user_id = ?', (clerk_user_id,))
    user = cursor.fetchone()
    
    if not user:
        cursor.execute('''
            INSERT INTO users (clerk_user_id, email, first_name, last_name)
            VALUES (?, ?, ?, ?)
        ''', (clerk_user_id, email, first_name, last_name))
        conn.commit()
        user_id = cursor.lastrowid
    else:
        user_id = user[0]
    
    conn.close()
    return user_id

# Routes
@app.route('/')
def index():
    return render_template('index.html', 
                         clerk_publishable_key=CLERK_PUBLISHABLE_KEY,
                         clerk_frontend_api=CLERK_FRONTEND_API)

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html',
                         clerk_publishable_key=CLERK_PUBLISHABLE_KEY,
                         clerk_frontend_api=CLERK_FRONTEND_API)

@app.route('/api/user/profile', methods=['POST'])
@clerk_auth_required
def save_user_profile():
    try:
        data = request.json
        clerk_user_id = data.get('clerk_user_id')
        email = data.get('email')
        first_name = data.get('first_name', '')
        last_name = data.get('last_name', '')
        
        user_id = get_or_create_user(clerk_user_id, email, first_name, last_name)
        
        return jsonify({'success': True, 'user_id': user_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/financial-data', methods=['POST'])
@clerk_auth_required
def save_financial_data():
    try:
        data = request.json
        clerk_user_id = data.get('clerk_user_id')
        
        # Get user ID
        conn = sqlite3.connect('financial_data.db')
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM users WHERE clerk_user_id = ?', (clerk_user_id,))
        user = cursor.fetchone()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        user_id = user[0]
        
        # Save or update financial data
        cursor.execute('''
            INSERT OR REPLACE INTO financial_data 
            (user_id, monthly_income, monthly_expenses, savings_goal, current_savings, 
             debt_amount, investment_amount, emergency_fund)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            user_id,
            data.get('monthly_income', 0),
            data.get('monthly_expenses', 0),
            data.get('savings_goal', 0),
            data.get('current_savings', 0),
            data.get('debt_amount', 0),
            data.get('investment_amount', 0),
            data.get('emergency_fund', 0)
        ))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Financial data saved successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/financial-data', methods=['GET'])
@clerk_auth_required
def get_financial_data():
    try:
        clerk_user_id = request.args.get('clerk_user_id')
        
        conn = sqlite3.connect('financial_data.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT f.* FROM financial_data f
            JOIN users u ON f.user_id = u.id
            WHERE u.clerk_user_id = ?
            ORDER BY f.updated_at DESC LIMIT 1
        ''', (clerk_user_id,))
        
        result = cursor.fetchone()
        conn.close()
        
        if result:
            columns = ['id', 'user_id', 'monthly_income', 'monthly_expenses', 
                      'savings_goal', 'current_savings', 'debt_amount', 
                      'investment_amount', 'emergency_fund', 'updated_at']
            financial_data = dict(zip(columns, result))
            return jsonify(financial_data)
        else:
            return jsonify({'message': 'No financial data found'})
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/transactions', methods=['POST'])
@clerk_auth_required
def add_transaction():
    try:
        data = request.json
        clerk_user_id = data.get('clerk_user_id')
        
        conn = sqlite3.connect('financial_data.db')
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM users WHERE clerk_user_id = ?', (clerk_user_id,))
        user = cursor.fetchone()
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        user_id = user[0]
        
        cursor.execute('''
            INSERT INTO transactions (user_id, type, category, amount, description, date)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            user_id,
            data.get('type'),
            data.get('category'),
            data.get('amount'),
            data.get('description', ''),
            data.get('date', datetime.now().date())
        ))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Transaction added successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/transactions', methods=['GET'])
@clerk_auth_required
def get_transactions():
    try:
        clerk_user_id = request.args.get('clerk_user_id')
        limit = request.args.get('limit', 50)
        
        conn = sqlite3.connect('financial_data.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT t.* FROM transactions t
            JOIN users u ON t.user_id = u.id
            WHERE u.clerk_user_id = ?
            ORDER BY t.date DESC, t.created_at DESC
            LIMIT ?
        ''', (clerk_user_id, limit))
        
        results = cursor.fetchall()
        conn.close()
        
        columns = ['id', 'user_id', 'type', 'category', 'amount', 
                  'description', 'date', 'created_at']
        transactions = [dict(zip(columns, row)) for row in results]
        
        return jsonify(transactions)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/ai-advice', methods=['POST'])
@clerk_auth_required
def get_ai_advice():
    try:
        data = request.json
        clerk_user_id = data.get('clerk_user_id')
        
        # Get user's financial data
        conn = sqlite3.connect('financial_data.db')
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT f.*, u.first_name FROM financial_data f
            JOIN users u ON f.user_id = u.id
            WHERE u.clerk_user_id = ?
            ORDER BY f.updated_at DESC LIMIT 1
        ''', (clerk_user_id,))
        
        financial_data = cursor.fetchone()
        
        if not financial_data:
            return jsonify({'error': 'No financial data found'}), 404
        
        # Get recent transactions for context
        cursor.execute('''
            SELECT t.type, t.category, t.amount FROM transactions t
            JOIN users u ON t.user_id = u.id
            WHERE u.clerk_user_id = ?
            ORDER BY t.date DESC LIMIT 10
        ''', (clerk_user_id,))
        
        recent_transactions = cursor.fetchall()
        conn.close()
        
        # Prepare financial summary for AI
        monthly_income = financial_data[2] or 0
        monthly_expenses = financial_data[3] or 0
        savings_goal = financial_data[4] or 0
        current_savings = financial_data[5] or 0
        debt_amount = financial_data[6] or 0
        investment_amount = financial_data[7] or 0
        emergency_fund = financial_data[8] or 0
        first_name = financial_data[9] or "User"
        
        # Calculate key metrics
        net_income = monthly_income - monthly_expenses
        savings_rate = (net_income / monthly_income * 100) if monthly_income > 0 else 0
        debt_to_income = (debt_amount / monthly_income) if monthly_income > 0 else 0
        
        # Create prompt for AI
        prompt = f"""
        As a professional financial advisor, provide personalized advice for {first_name} based on their financial situation:

        Financial Overview:
        - Monthly Income: ${monthly_income:,.2f}
        - Monthly Expenses: ${monthly_expenses:,.2f}
        - Net Monthly Income: ${net_income:,.2f}
        - Savings Rate: {savings_rate:.1f}%
        - Current Savings: ${current_savings:,.2f}
        - Savings Goal: ${savings_goal:,.2f}
        - Total Debt: ${debt_amount:,.2f}
        - Investment Amount: ${investment_amount:,.2f}
        - Emergency Fund: ${emergency_fund:,.2f}
        - Debt-to-Income Ratio: {debt_to_income:.2f}

        Recent Transaction Categories: {', '.join([f"{t[1]}: ${t[2]}" for t in recent_transactions[:5]])}

        Please provide:
        1. Overall financial health assessment
        2. Top 3 actionable recommendations
        3. Budget optimization suggestions
        4. Savings and investment advice
        5. Debt management strategy (if applicable)
        6. Emergency fund recommendations

        Keep the advice practical, specific, and encouraging. Format the response in clear sections.
        """
        
        # Get AI response from Groq
        completion = groq_client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[
                {
                    "role": "system",
                    "content": "You are a professional financial advisor providing personalized, actionable advice. Be encouraging but realistic, and focus on practical steps the user can take."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.7,
            max_tokens=1500
        )
        
        ai_advice = completion.choices[0].message.content
        
        return jsonify({
            'success': True,
            'advice': ai_advice,
            'financial_summary': {
                'monthly_income': monthly_income,
                'monthly_expenses': monthly_expenses,
                'net_income': net_income,
                'savings_rate': round(savings_rate, 1),
                'debt_to_income_ratio': round(debt_to_income, 2)
            }
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/financial-analysis', methods=['GET'])
@clerk_auth_required
def get_financial_analysis():
    try:
        clerk_user_id = request.args.get('clerk_user_id')
        
        conn = sqlite3.connect('financial_data.db')
        cursor = conn.cursor()
        
        # Get financial data
        cursor.execute('''
            SELECT f.* FROM financial_data f
            JOIN users u ON f.user_id = u.id
            WHERE u.clerk_user_id = ?
            ORDER BY f.updated_at DESC LIMIT 1
        ''', (clerk_user_id,))
        
        financial_data = cursor.fetchone()
        
        if not financial_data:
            return jsonify({'error': 'No financial data found'}), 404
        
        # Get spending by category
        cursor.execute('''
            SELECT t.category, SUM(t.amount) as total FROM transactions t
            JOIN users u ON t.user_id = u.id
            WHERE u.clerk_user_id = ? AND t.type = 'expense'
            GROUP BY t.category
            ORDER BY total DESC
        ''', (clerk_user_id,))
        
        spending_by_category = cursor.fetchall()
        
        # Get monthly trends (last 6 months)
        cursor.execute('''
            SELECT 
                strftime('%Y-%m', t.date) as month,
                SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END) as income,
                SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END) as expenses
            FROM transactions t
            JOIN users u ON t.user_id = u.id
            WHERE u.clerk_user_id = ? AND t.date >= date('now', '-6 months')
            GROUP BY strftime('%Y-%m', t.date)
            ORDER BY month
        ''', (clerk_user_id,))
        
        monthly_trends = cursor.fetchall()
        
        conn.close()
        
        # Process data
        monthly_income = financial_data[2] or 0
        monthly_expenses = financial_data[3] or 0
        current_savings = financial_data[5] or 0
        debt_amount = financial_data[6] or 0
        emergency_fund = financial_data[8] or 0
        
        analysis = {
            'net_worth': current_savings + financial_data[7] - debt_amount,
            'monthly_surplus': monthly_income - monthly_expenses,
            'emergency_fund_months': (emergency_fund / monthly_expenses) if monthly_expenses > 0 else 0,
            'spending_by_category': [{'category': cat[0], 'amount': cat[1]} for cat in spending_by_category],
            'monthly_trends': [{'month': trend[0], 'income': trend[1], 'expenses': trend[2]} for trend in monthly_trends],
            'financial_health_score': calculate_financial_health_score(financial_data)
        }
        
        return jsonify(analysis)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def calculate_financial_health_score(financial_data):
    score = 0
    monthly_income = financial_data[2] or 0
    monthly_expenses = financial_data[3] or 0
    current_savings = financial_data[5] or 0
    debt_amount = financial_data[6] or 0
    emergency_fund = financial_data[8] or 0
    
    if monthly_income > 0:
        # Savings rate (max 30 points)
        savings_rate = ((monthly_income - monthly_expenses) / monthly_income) * 100
        score += min(30, savings_rate * 1.5)
        
        # Emergency fund (max 25 points)
        if monthly_expenses > 0:
            emergency_months = emergency_fund / monthly_expenses
            score += min(25, emergency_months * 4)
        
        # Debt-to-income ratio (max 25 points)
        debt_ratio = debt_amount / monthly_income
        if debt_ratio <= 0.1:
            score += 25
        elif debt_ratio <= 0.3:
            score += 15
        elif debt_ratio <= 0.5:
            score += 10
        
        # Having savings (max 20 points)
        if current_savings > 0:
            score += min(20, (current_savings / monthly_income) * 2)
    
    return min(100, max(0, score))

if __name__ == '__main__':
    init_db()
    app.run(debug=True)