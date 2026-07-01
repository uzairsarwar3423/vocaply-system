import httpx
import json
import uuid

turns = [
    {
        "turn_id": str(uuid.uuid4()),
        "cleaned_text": "I'll finish the login feature by Thursday.",
        "original_text": "I'll finish the login feature by Thursday.",
        "speaker_name": "Alice",
        "start_time": 0.0,
        "end_time": 5.0
    },
    {
        "turn_id": str(uuid.uuid4()),
        "cleaned_text": "I should be able to look at the database issues tomorrow.",
        "original_text": "I should be able to look at the database issues tomorrow.",
        "speaker_name": "Bob",
        "start_time": 6.0,
        "end_time": 10.0
    },
    {
        "turn_id": str(uuid.uuid4()),
        "cleaned_text": "Sarah, can you please review my PR?",
        "original_text": "Sarah, can you please review my PR?",
        "speaker_name": "Charlie",
        "start_time": 11.0,
        "end_time": 15.0
    },
    {
        "turn_id": str(uuid.uuid4()),
        "cleaned_text": "We're shipping Friday.",
        "original_text": "We're shipping Friday.",
        "speaker_name": "David",
        "start_time": 16.0,
        "end_time": 18.0
    },
    {
        "turn_id": str(uuid.uuid4()),
        "cleaned_text": "Waiting on design assets.",
        "original_text": "Waiting on design assets.",
        "speaker_name": "Eve",
        "start_time": 19.0,
        "end_time": 21.0
    }
]

payload = {
    "meeting_id": "test_meeting_01",
    "meeting_title": "Daily Standup",
    "meeting_date_iso": "2023-10-27T10:00:00Z",
    "participants": ["Alice", "Bob", "Charlie", "David", "Eve"],
    "turns": turns
}

print("Sending extraction request to http://localhost:8001/api/v1/extract ...")
resp = httpx.post("http://localhost:8001/api/v1/extract", json=payload, timeout=120.0)

print(f"Status: {resp.status_code}")
if resp.status_code == 200:
    print(json.dumps(resp.json(), indent=2))
else:
    print(resp.text)
