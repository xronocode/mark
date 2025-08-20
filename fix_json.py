#!/usr/bin/env python3
import json
import sys
import re

def fix_json_file(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Try to parse JSON to get detailed error info
        try:
            parsed = json.loads(content)
            print(f"JSON file {file_path} is already valid")
            return True
        except json.JSONDecodeError as e:
            print(f"JSON Error: {e}")
            print(f"Error at line {e.lineno}, column {e.colno}")
            
            # Try some common fixes
            lines = content.split('\n')
            
            # Check for "Extra data" error - usually means multiple root objects
            if "Extra data" in str(e):
                # Find the position of the error
                error_line = e.lineno - 1
                if error_line < len(lines):
                    line_content = lines[error_line].strip()
                    print(f"Problematic line: {line_content}")
                    
                    # If it's a closing brace followed by comma, it might be wrong structure
                    if line_content == "},":
                        print("Found potential structure issue: extra comma after closing brace")
                        # Try to understand the context
                        for i in range(max(0, error_line-10), min(len(lines), error_line+10)):
                            marker = " -> " if i == error_line else "    "
                            print(f"{marker}{i+1:3d}: {lines[i]}")
            
            return False
            
    except Exception as e:
        print(f"Error reading file: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 fix_json.py <json_file_path>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    success = fix_json_file(file_path)
    sys.exit(0 if success else 1)