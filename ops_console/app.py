import streamlit as st
import snowflake.snowpark as snowpark
from snowflake.snowpark import Session

# KAVACH Ops Console — Minimal Streamlit Admin Dashboard

st.set_page_config(page_title="KAVACH Ops Console", page_icon="🛡️", layout="wide")

def get_session():
    """Get Snowpark session"""
    return snowpark.context.get_active_session()

st.title("🛡️ KAVACH Operations Console")
st.caption("Admin dashboard for task control, credit monitoring, and tour data reset")

session = get_session()

# ============================================================================
# Tab 1: Credit Usage
# ============================================================================
tab1, tab2, tab3 = st.tabs(["💰 Credits", "⚙️ Tasks", "🎯 Tour Data"])

with tab1:
    st.header("Credit Usage (Last 7 Days)")
    
    query = """
        SELECT 
            WAREHOUSE_NAME,
            SUM(CREDITS_USED) AS TOTAL_CREDITS,
            COUNT(*) AS EXECUTIONS
        FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY
        WHERE START_TIME >= DATEADD('day', -7, CURRENT_TIMESTAMP())
        GROUP BY WAREHOUSE_NAME
        ORDER BY TOTAL_CREDITS DESC
    """
    
    df = session.sql(query).to_pandas()
    
    col1, col2 = st.columns(2)
    with col1:
        st.metric("Total Credits (7d)", f"{df['TOTAL_CREDITS'].sum():.2f}")
    with col2:
        st.metric("KAVACH_WH Credits", f"{df[df['WAREHOUSE_NAME']=='KAVACH_WH']['TOTAL_CREDITS'].sum():.2f}")
    
    st.dataframe(df, use_container_width=True)

# ============================================================================
# Tab 2: Task Management
# ============================================================================
with tab2:
    st.header("Task Pipeline Control")
    
    st.info("Tasks not yet created. Will be added in Phase 8.")
    
    # Placeholder for future implementation
    if st.button("▶️ Resume All Tasks"):
        st.warning("Not implemented: CREATE TASK statements needed first")
    
    if st.button("⏸️ Suspend All Tasks"):
        st.warning("Not implemented: CREATE TASK statements needed first")

# ============================================================================
# Tab 3: Tour Data Reset
# ============================================================================
with tab3:
    st.header("Product Tour Data Reset")
    
    st.write("""
    Resets demo data to a known state for the product tour:
    - 1 pending rule approval
    - 1 open mule ring alert
    - Clears related feedback and evidence
    """)
    
    if st.button("🔄 Reset Tour Data", type="primary"):
        try:
            session.sql("CALL AI.RESET_TOUR_DATA()").collect()
            st.success("✅ Tour data reset successfully")
        except Exception as e:
            st.error(f"❌ Error: {e}")

# ============================================================================
# Sidebar: System Health
# ============================================================================
with st.sidebar:
    st.header("System Status")
    
    # Readiness score
    try:
        score_df = session.sql("SELECT * FROM AI.READINESS_SCORE").to_pandas()
        score = score_df['READINESS_SCORE'].iloc[0]
        reason = score_df['REASON'].iloc[0]
        
        st.metric("Readiness Score", f"{score}/100")
        st.caption(reason)
    except:
        st.warning("Readiness score unavailable")
    
    # Alert counts
    try:
        alert_counts = session.sql("""
            SELECT 
                status,
                COUNT(*) AS count
            FROM CORE.ALERTS
            GROUP BY status
        """).to_pandas()
        
        st.write("**Alert Status**")
        for _, row in alert_counts.iterrows():
            st.write(f"- {row['STATUS']}: {row['COUNT']}")
    except:
        st.warning("Alert counts unavailable")
