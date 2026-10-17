# app/schemas/analytics.py
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict, Any, List


class StudentRiskResponse(BaseModel):
    student_id: int
    student_name: str
    risk_level: str            # "low" | "medium" | "high"
    risk_score: float
    contributing_factors: Optional[Dict[str, Any]] = None
    badges: List[Dict[str, Any]] = []
    model_version: str
    computed_at: datetime

    class Config:
        from_attributes = True


class CourseRiskSummary(BaseModel):
    course_id: int
    total_students: int
    high_risk_count: int
    medium_risk_count: int
    low_risk_count: int
    model_version: str
    feature_importance: Optional[Dict[str, float]] = None  # None on heuristic fallback
    students: List[StudentRiskResponse]


class StudentProgressResponse(BaseModel):
    student_id: int
    student_name: str
    course_id: int
    granularity: str
    periods_requested: int
    generated_at: datetime
    periods: List[Dict[str, Any]]
    series: Dict[str, List[Optional[float]]]
    trends: Dict[str, Any]
    dimensions: List[Dict[str, Any]]
    strongest_area: Optional[Dict[str, Any]] = None
    weakest_area: Optional[Dict[str, Any]] = None
    summary: Dict[str, Any]
    risk: Dict[str, Any]
    insights: List[Dict[str, Any]]
    meta: Dict[str, Any]


class CourseProgressOverviewResponse(BaseModel):
    course_id: int
    granularity: str
    periods_requested: int
    generated_at: datetime
    total_students: int
    average_score: Optional[float] = None
    risk_breakdown: Dict[str, int]
    trend_breakdown: Dict[str, int]
    cohort_trajectory: List[Dict[str, Any]]
    interventions: List[Dict[str, Any]]
    students: List[Dict[str, Any]]