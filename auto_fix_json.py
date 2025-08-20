#!/usr/bin/env python3
import json
import sys
import re

def auto_fix_json(file_path):
    """Automatically fix common JSON issues"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # First try to parse as-is
        try:
            parsed = json.loads(content)
            print(f"JSON file {file_path} is already valid")
            return True
        except json.JSONDecodeError as e:
            print(f"JSON Error: {e}")
            
            # Try to fix "Extra data" errors
            if "Extra data" in str(e):
                print("Attempting to fix 'Extra data' error...")
                
                # Split into lines
                lines = content.split('\n')
                
                # Find the error position
                char_count = 0
                error_line_idx = -1
                
                for i, line in enumerate(lines):
                    if char_count + len(line) + 1 >= e.pos:  # +1 for newline
                        error_line_idx = i
                        break
                    char_count += len(line) + 1
                
                if error_line_idx >= 0:
                    print(f"Error around line {error_line_idx + 1}: {lines[error_line_idx].strip()}")
                    
                    # Try to find the first valid JSON object
                    brace_count = 0
                    first_object_end = -1
                    
                    for i, char in enumerate(content):
                        if char == '{':
                            brace_count += 1
                        elif char == '}':
                            brace_count -= 1
                            if brace_count == 0:
                                first_object_end = i
                                break
                    
                    if first_object_end > 0:
                        # Extract the first complete JSON object
                        first_object = content[:first_object_end + 1]
                        
                        try:
                            # Test if the first object is valid
                            parsed_first = json.loads(first_object)
                            print("Found valid first JSON object")
                            
                            # Write the fixed content
                            with open(file_path, 'w', encoding='utf-8') as f:
                                json.dump(parsed_first, f, ensure_ascii=False, indent=2)
                            
                            print(f"Fixed {file_path} by keeping only the first valid JSON object")
                            return True
                            
                        except json.JSONDecodeError:
                            print("First object is not valid JSON")
            
            # Try to fix quote escaping issues
            if "Unterminated string" in str(e) or "Invalid \\escape" in str(e):
                print("Attempting to fix quote escaping issues...")
                
                # Fix unescaped quotes in strings
                fixed_content = re.sub(r'"([^"]*?)"([^"]*?)"([^"]*?)"', r'"\1\\"\2\\"\3"', content)
                
                try:
                    parsed = json.loads(fixed_content)
                    with open(file_path, 'w', encoding='utf-8') as f:
                        json.dump(parsed, f, ensure_ascii=False, indent=2)
                    print(f"Fixed {file_path} by escaping quotes")
                    return True
                except json.JSONDecodeError:
                    print("Quote escaping fix didn't work")
            
            return False
            
    except Exception as e:
        print(f"Error processing file: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 auto_fix_json.py <json_file_path>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    success = auto_fix_json(file_path)
    sys.exit(0 if success else 1)